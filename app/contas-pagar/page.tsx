'use client';

/**
 * Contas a pagar (/contas-pagar) — Financeiro da empresa, etapa 1 — 11/11/2026. Back-end: fin_pagar.php e fin_base.php.
 * Títulos com parcelas e rateio (natureza, local, área · linha, veículo), instalações de consumo, recorrentes (previsto → confirmar),
 * pagamento com juros/multa/desconto e comprovante, estorno e cancelamento com motivo, alertas (fora do padrão, orçamento, sem comprovante).
 * Sem etapa de autorização. A fatura do cartão chega aqui como um título só (as compras ficam em /cartao-credito).
 * 12/11/2026 (etapa 3): lista ou planilha (rolagem para o lado, colunas à escolha, total do filtro, exportar), filtros avançados,
 * pagamento em lote, botão Mais (prorrogar, natureza, pedir cancelamento e histórico), situação Cancelados. Cancelar passa pela Gestão
 * (fin_pagar_acoes.php; a decisão é na aba Aprovações da Tesouraria).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    IconAdjustmentsDollar,
    IconAlertTriangle,
    IconArrowBackUp,
    IconBan,
    IconColumns,
    IconCreditCard,
    IconDownload,
    IconFilter,
    IconPaperclip,
    IconPencil,
    IconPlus,
    IconReceipt,
    IconRefresh,
    IconRepeat,
    IconSearch,
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
    CARTAO,
    dataBR,
    diaMais,
    diaMes,
    diaSemana,
    EditorRateio,
    enviarAnexo,
    ERRO,
    hojeISO,
    Janela,
    linhaVazia,
    mensagemErro,
    NOTA,
    numCampo,
    paraNumero,
    PILULA,
    rateioParaEnvio,
    ROTULO,
    S_AB,
    S_AVISO,
    S_MUDO,
    S_OK,
    S_RUIM,
    SelectNatureza,
    SELO,
    SUB,
    URL_PAGAR,
    urlAnexo,
    useAviso,
    useCadastros,
    type Cadastros,
    type LinhaEdicao,
} from './components/fin';
import { BarraMassa, baixarCsv, ChipsFiltro, JanelaColunas, Paginacao, Planilha, TrocaModo, useColunas, type ColunaPlan } from './components/planilha';

const URL_ACOES = 'https://api.planoassistencialintegrado.com.br/fin_pagar_acoes.php';

type LinhaRat = { natureza_id: number; natureza: string; local_id: number | null; local: string | null; area_id: number | null; area: string | null; veiculo_id: number | null; veiculo: string | null; valor: number };
type Titulo = {
    id: number;
    pessoa_id: number | null;
    pessoa: string;
    descricao: string;
    documento: string | null;
    emissao: string | null;
    competencia: string;
    vencimento: string;
    valor: number;
    parcela: string | null;
    forma_id: number | null;
    forma: string | null;
    exige_comprovante: boolean;
    linha_digitavel: string | null;
    situacao: 'PREVISTO' | 'ABERTO' | 'PAGO' | 'CANCELADO';
    origem: 'MANUAL' | 'RECORRENTE' | 'FOLHA' | 'COMISSAO' | 'ESTOQUE' | 'CARTAO';
    recorrente_id: number | null;
    instalacao_id: number | null;
    instalacao: string | null;
    fatura_conta_id: number | null;
    fatura_vencimento: string | null;
    rateio: LinhaRat[];
    baixa: { id: number; data: string; conta_id: number; conta: string; valor_pago: number; juros: number; multa: number; desconto: number } | null;
    anexos: number;
    comprovantes: number;
    cancelado_motivo?: string | null;
};
type Pendente = { tipo: string; motivo: string };
type FAP = { td?: string; de?: string; ate?: string; pessoa?: string; natureza?: string; doc?: string; vmin?: string; vmax?: string; anexo?: string; forma?: string; conta?: string };
type Detalhe = Titulo & {
    baixas: { id: number; data: string; valor_pago: number; juros: number; multa: number; desconto: number; por: string | null; em: string; estornado_em: string | null; estornado_por: string | null; estorno_motivo: string | null }[];
    anexos_lista: { id: number; nome: string; tipo: string; tamanho: number; comprovante: boolean; em: string }[];
    historico: { acao: string; criado_em: string; nome: string | null }[];
    compras?: { data: string; descricao: string; parcela: string | null; valor: number }[];
};
type Alerta = { tipo: 'FORA_PADRAO' | 'ORCAMENTO' | 'SEM_COMPROVANTE' | 'PREVISTO'; nivel: 'erro' | 'aviso'; texto: string; titulo_id?: number };
type Dados = {
    hoje: string;
    titulos: Titulo[];
    cards: Record<'vencidos' | 'hoje' | 'semana' | 'pagos_mes', { n: number; v: number }>;
    alertas: Alerta[];
    faturas_abertas: { conta_id: number; conta: string; vencimento: string; fechamento: string; valor: number; lancamentos: number }[];
    mes_fechado: boolean;
};
type Filtro = 'aberto' | 'vencidos' | 'hoje' | 'semana' | 'previstos' | 'pagos' | 'cancelados' | 'todos';

const ORIGEM: Partial<Record<Titulo['origem'], string>> = { RECORRENTE: 'todo mês', FOLHA: 'da Folha', COMISSAO: 'das Comissões', ESTOQUE: 'do Estoque', CARTAO: 'do Cartão' };
const ACAO: Record<string, string> = {
    incluiu: 'Lançado',
    alterou: 'Alterado',
    confirmou: 'Valor confirmado',
    pagou: 'Pago',
    estornou: 'Pagamento estornado',
    cancelou: 'Cancelado',
    fatura_fechada: 'Fatura fechada',
    prorrogou: 'Vencimento prorrogado',
    pediu_cancelamento: 'Cancelamento pedido à Gestão',
    recusou_cancelamento: 'Cancelamento recusado pela Gestão',
};

function situacaoDe(t: Titulo, hoje: string): { txt: string; cls: string; k: 'pago' | 'previsto' | 'vencido' | 'hoje' | 'aberto' | 'cancelado' } {
    if (t.situacao === 'CANCELADO') return { txt: 'Cancelado', cls: S_MUDO, k: 'cancelado' };
    if (t.situacao === 'PAGO') return { txt: 'Pago', cls: S_OK, k: 'pago' };
    if (t.situacao === 'PREVISTO') return { txt: 'Previsto', cls: S_MUDO, k: 'previsto' };
    if (t.vencimento < hoje) return { txt: 'Vencido', cls: S_RUIM, k: 'vencido' };
    if (t.vencimento === hoje) return { txt: 'Vence hoje', cls: S_AVISO, k: 'hoje' };
    return { txt: 'Em aberto', cls: S_AB, k: 'aberto' };
}

export default function ContasPagarPage() {
    const { cad, erroCad, recarregar: recarregarCad } = useCadastros();
    const [d, setD] = useState<Dados | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<Filtro>('aberto');
    const [busca, setBusca] = useState('');
    const [area, setArea] = useState<number | ''>('');
    const [novo, setNovo] = useState<{ editar?: Titulo } | null>(null);
    const [pagar, setPagar] = useState<Titulo | null>(null);
    const [confirmar, setConfirmar] = useState<Titulo | null>(null);
    const [detalhe, setDetalhe] = useState<number | null>(null);
    const { avisar, aviso } = useAviso();
    const [modo, setModo] = useState<'lista' | 'planilha'>('lista');
    const [fa, setFa] = useState<FAP>({});
    const [ordem, setOrdem] = useState('venc');
    const [pagina, setPagina] = useState(0);
    const [pp, setPp] = useState(100);
    const [marc, setMarc] = useState<Set<number>>(new Set());
    const [loteConta, setLoteConta] = useState<number | ''>('');
    const [loteData, setLoteData] = useState('');
    const [loteOcupado, setLoteOcupado] = useState(false);
    const [janela, setJanela] = useState<null | 'filtros' | 'colunas' | { acoes: Titulo }>(null);
    const [cancelados, setCancelados] = useState<Titulo[]>([]);
    const [pendentes, setPendentes] = useState<Record<number, Pendente>>({});

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const j = await api(URL_PAGAR, 'titulos');
            setD(j.dados);
            setErro(null);
            try {
                const x = await api(URL_ACOES, 'extras');
                setPendentes(x.dados.pendentes || {});
                setCancelados(
                    (x.dados.cancelados as any[]).map((c) => ({
                        ...c,
                        pessoa_id: null,
                        forma_id: null,
                        exige_comprovante: false,
                        linha_digitavel: null,
                        situacao: 'CANCELADO',
                        recorrente_id: null,
                        instalacao_id: null,
                        instalacao: null,
                        fatura_conta_id: null,
                        fatura_vencimento: null,
                        grupo: null,
                        rateio: c.natureza ? [{ natureza_id: 0, natureza: c.natureza, local_id: null, local: null, area_id: null, area: null, veiculo_id: null, veiculo: null, valor: c.valor }] : [],
                        baixa: null,
                        anexos: 0,
                        comprovantes: 0,
                    })),
                );
            } catch {
                /* fin_pagar_acoes.php ainda não subiu: segue sem cancelados e pedidos */
            }
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o contas a pagar.');
            if (m) setErro(m);
        } finally {
            setCarregando(false);
        }
    }, []);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const hoje = d?.hoje || hojeISO();
    const sem = diaMais(hoje, 7);

    const lista = useMemo(() => {
        if (!d) return [];
        const q = busca.trim().toLowerCase();
        const base = filtro === 'cancelados' ? cancelados : d.titulos;
        const vmin = paraNumero(fa.vmin ?? '') ?? null;
        const vmax = paraNumero(fa.vmax ?? '') ?? null;
        return base.filter((t) => {
            const s = situacaoDe(t, hoje).k;
            if (filtro === 'cancelados' && s !== 'cancelado') return false;
            if (fa.de || fa.ate) {
                const dt = fa.td === 'emis' ? t.emissao : fa.td === 'comp' ? (t.competencia ? t.competencia + '-01' : null) : fa.td === 'pago' ? t.baixa?.data ?? null : t.vencimento;
                const de = fa.td === 'comp' && fa.de ? fa.de.slice(0, 7) + '-01' : fa.de;
                if (!dt || (de && dt < de) || (fa.ate && dt > fa.ate)) return false;
            }
            if (fa.pessoa && t.pessoa !== fa.pessoa) return false;
            if (fa.natureza && !t.rateio.some((r) => r.natureza === fa.natureza)) return false;
            if (fa.doc && !`${t.documento || ''} ${t.descricao} ${t.linha_digitavel || ''}`.toLowerCase().includes(fa.doc.toLowerCase())) return false;
            if (vmin !== null && t.valor < vmin) return false;
            if (vmax !== null && t.valor > vmax) return false;
            if (fa.anexo === 'com' && !t.anexos) return false;
            if (fa.anexo === 'sem' && t.anexos) return false;
            if (fa.forma && t.forma !== fa.forma) return false;
            if (fa.conta && t.baixa?.conta !== fa.conta) return false;
            if (filtro === 'aberto' && s === 'pago') return false;
            if (filtro === 'vencidos' && s !== 'vencido') return false;
            if (filtro === 'hoje' && s !== 'hoje') return false;
            if (filtro === 'semana' && !(t.situacao !== 'PAGO' && t.vencimento > hoje && t.vencimento <= sem)) return false;
            if (filtro === 'previstos' && s !== 'previsto') return false;
            if (filtro === 'pagos' && s !== 'pago') return false;
            if (area !== '' && !t.rateio.some((r) => r.area_id === area || cad?.areas.find((a) => a.id === area)?.linhas.some((l) => l.id === r.area_id))) return false;
            if (q && !`${t.pessoa} ${t.descricao} ${t.documento || ''} ${t.rateio.map((r) => r.natureza).join(' ')}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [d, filtro, busca, area, hoje, sem, cad, cancelados, fa]);

    // planilha: ordem, página, seleção e colunas
    useEffect(() => {
        setPagina(0);
        setMarc(new Set());
    }, [filtro, busca, area, fa, ordem, pp]);
    const ordenada = useMemo(
        () =>
            lista
                .slice()
                .sort((a, b) =>
                    ordem === 'valor' ? b.valor - a.valor : ordem === 'forn' ? (a.pessoa || '').localeCompare(b.pessoa || '') : a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.id - b.id,
                ),
        [lista, ordem],
    );
    const paginaLinhas = ordenada.slice(pagina * pp, pagina * pp + pp);
    const selecionavel = useCallback((t: Titulo) => t.situacao === 'ABERTO' && t.origem !== 'CARTAO' && !pendentes[t.id], [pendentes]);
    const selFiltro = ordenada.filter(selecionavel);
    const todosFiltro = selFiltro.length > 0 && selFiltro.every((t) => marc.has(t.id));
    const marcados = (d?.titulos ?? []).filter((t) => marc.has(t.id) && selecionavel(t));
    const marcar = (ids: number[], on: boolean) =>
        setMarc((m) => {
            const n = new Set(m);
            ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
            return n;
        });
    const pagarLote = async () => {
        if (!loteConta) return avisar('Escolha a conta de onde saiu o dinheiro.');
        setLoteOcupado(true);
        try {
            const j = await api(URL_ACOES, 'pagar_lote', { ids: marcados.map((t) => t.id), data: loteData || hoje, conta_id: loteConta });
            avisar(j.msg);
            setMarc(new Set());
            void carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível pagar em lote.');
            if (m) avisar(m);
        } finally {
            setLoteOcupado(false);
        }
    };
    const juros = (t: Titulo) => (t.baixa ? t.baixa.juros + t.baixa.multa : 0);
    const COLUNAS: ColunaPlan<Titulo>[] = useMemo(
        () => [
            { id: 'nat', rotulo: 'Natureza', largura: 210, valor: (t) => (t.rateio.length ? t.rateio[0].natureza + (t.rateio.length > 1 ? ` + ${t.rateio.length - 1}` : '') : t.origem === 'CARTAO' ? 'Compras do cartão' : '—') },
            { id: 'centro', rotulo: 'Área · local', largura: 200, valor: (t) => t.instalacao || [t.rateio[0]?.local, t.rateio[0]?.area, t.rateio[0]?.veiculo].filter(Boolean).join(' · ') || '—' },
            { id: 'doc', rotulo: 'Documento', largura: 120, valor: (t) => t.documento || '—' },
            { id: 'emis', rotulo: 'Emissão', largura: 110, padrao: false, valor: (t) => dataBR(t.emissao) || '—' },
            { id: 'comp', rotulo: 'Competência', largura: 125, valor: (t) => (t.competencia ? `${t.competencia.slice(5)}/${t.competencia.slice(0, 4)}` : '—') },
            { id: 'venc', rotulo: 'Vencimento', largura: 120, valor: (t) => dataBR(t.vencimento) },
            { id: 'parc', rotulo: 'Parcela', largura: 80, valor: (t) => t.parcela || '—' },
            { id: 'valor', rotulo: 'Valor', largura: 120, num: true, valor: (t) => brl(t.valor), texto: (t) => t.valor },
            { id: 'enc', rotulo: 'Juros e multa', largura: 120, num: true, valor: (t) => (juros(t) ? <span className="text-[#B42318] dark:text-[#FF9C92]">{brl(juros(t))}</span> : '—'), texto: (t) => juros(t) },
            { id: 'pago', rotulo: 'Valor pago', largura: 120, num: true, valor: (t) => (t.baixa ? brl(t.baixa.valor_pago) : '—'), texto: (t) => t.baixa?.valor_pago ?? '' },
            { id: 'forma', rotulo: 'Forma', largura: 150, valor: (t) => t.forma || '—' },
            {
                id: 'sit',
                rotulo: 'Situação',
                largura: 180,
                valor: (t) => {
                    const s = pendentes[t.id] ? { txt: 'Cancelamento pedido', cls: S_AVISO } : situacaoDe(t, hoje);
                    return <span className={`${SELO} ${s.cls}`}>{s.txt}</span>;
                },
                texto: (t) => (pendentes[t.id] ? 'Cancelamento pedido' : situacaoDe(t, hoje).txt),
            },
            {
                id: 'atraso',
                rotulo: 'Atraso',
                largura: 80,
                num: true,
                valor: (t) => (t.situacao === 'ABERTO' && t.vencimento < hoje ? `${Math.round((Date.parse(hoje) - Date.parse(t.vencimento)) / 864e5)}d` : '—'),
            },
            { id: 'pagoem', rotulo: 'Pago em', largura: 110, valor: (t) => dataBR(t.baixa?.data) || '—' },
            { id: 'conta', rotulo: 'Saiu da conta', largura: 190, valor: (t) => t.baixa?.conta || '—' },
            { id: 'anexos', rotulo: 'Anexos', largura: 80, num: true, valor: (t) => String(t.anexos || 0) },
            { id: 'origem', rotulo: 'Origem', largura: 130, padrao: false, valor: (t) => ORIGEM[t.origem] || 'lançado' },
            { id: 'linha', rotulo: 'Linha digitável', largura: 330, padrao: false, valor: (t) => t.linha_digitavel || '—' },
            { id: 'motivo', rotulo: 'Motivo do cancelamento', largura: 240, padrao: false, valor: (t) => t.cancelado_motivo || pendentes[t.id]?.motivo || '—' },
        ],
        [hoje, pendentes],
    );
    const cols = useColunas('pai_fin_pagar_colunas', COLUNAS);
    const somaV = ordenada.reduce((s, t) => s + t.valor, 0);
    const somaJ = ordenada.reduce((s, t) => s + juros(t), 0);
    const somaP = ordenada.reduce((s, t) => s + (t.baixa?.valor_pago ?? 0), 0);
    const chips = useMemo(() => {
        const tira = (k: (keyof FAP)[]) => () =>
            setFa((f) => {
                const n = { ...f };
                k.forEach((x) => delete n[x]);
                return n;
            });
        const TD: Record<string, string> = { venc: 'Vencimento', emis: 'Emissão', comp: 'Competência', pago: 'Pagamento' };
        const c: { rotulo: string; tirar: () => void }[] = [];
        if (fa.de || fa.ate) c.push({ rotulo: `${TD[fa.td || 'venc']}${fa.de ? ` de ${dataBR(fa.de)}` : ''}${fa.ate ? ` até ${dataBR(fa.ate)}` : ''}`, tirar: tira(['de', 'ate', 'td']) });
        const nomes: [keyof FAP, string][] = [
            ['pessoa', 'Fornecedor'],
            ['natureza', 'Natureza'],
            ['doc', 'Documento'],
            ['vmin', 'Valor de'],
            ['vmax', 'Valor até'],
            ['forma', 'Forma'],
            ['conta', 'Conta'],
        ];
        nomes.forEach(([k, r]) => {
            if (fa[k]) c.push({ rotulo: `${r}: ${fa[k]}`, tirar: tira([k]) });
        });
        if (fa.anexo) c.push({ rotulo: fa.anexo === 'com' ? 'Com anexo' : 'Sem anexo', tirar: tira(['anexo']) });
        return c;
    }, [fa]);

    const grupos = useMemo(() => {
        const g: { dia: string; itens: Titulo[] }[] = [];
        lista.forEach((t) => {
            const u = g[g.length - 1];
            if (u && u.dia === t.vencimento) u.itens.push(t);
            else g.push({ dia: t.vencimento, itens: [t] });
        });
        return g;
    }, [lista]);

    const cards = d?.cards;
    const cartao = (id: Filtro, rotulo: string, c: { n: number; v: number } | undefined, s: string, escuro = false, ruim = false) => (
        <button
            type="button"
            onClick={() => setFiltro(filtro === id ? 'aberto' : id)}
            className={[
                'flex min-w-0 flex-col gap-1 rounded-[18px] border p-4 text-left transition lg:px-5 lg:py-[18px]',
                escuro ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]' : 'border-[#E3E8F0] bg-white hover:border-[#C9D1DE] dark:border-white/[0.12] dark:bg-[#232B3F]',
                filtro === id ? (escuro ? 'shadow-[inset_0_0_0_3px_#F2CB3F]' : 'shadow-[inset_0_0_0_2px_#313C55] dark:shadow-[inset_0_0_0_2px_#F2CB3F]') : '',
            ].join(' ')}
        >
            <span className={`text-[12px] font-extrabold uppercase tracking-[0.08em] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{rotulo}</span>
            <span className={`text-[21px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${ruim && c?.n ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{brl(c?.v ?? 0)}</span>
            <span className={`text-[12.5px] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>
                {c?.n ?? 0} {s}
            </span>
        </button>
    );

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconReceipt}
                    titulo="Contas a pagar"
                    acoes={
                        <>
                            <Link href="/cartao-credito" className={BTN_SEC}>
                                <IconCreditCard size={18} /> Cartão
                            </Link>
                            <Link href="/financeiro-config" className={BTN_SEC}>
                                <IconAdjustmentsDollar size={18} /> Configurações
                            </Link>
                            <button type="button" className={BTN_PRI} disabled={!cad} onClick={() => setNovo({})}>
                                <IconPlus size={18} /> Novo título
                            </button>
                        </>
                    }
                />

                {erro || erroCad ? <div className={ERRO}>{erro || erroCad}</div> : null}
                {d?.mes_fechado ? <div className={`${NOTA} ${S_AVISO}`}>O mês atual está fechado: lançamentos e pagamentos dele estão travados até a Gestão reabrir.</div> : null}

                {d && d.alertas.length ? (
                    <div className={`${CARTAO} overflow-hidden`}>
                        <div className="px-4 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Alertas</div>
                        {d.alertas.map((a, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2.5 border-t border-[#E3E8F0] px-4 py-2.5 first:border-t-0 dark:border-white/[0.08]">
                                <span className={`${SELO} ${a.nivel === 'erro' ? S_RUIM : S_AVISO}`}>
                                    <IconAlertTriangle size={14} />
                                    {a.tipo === 'FORA_PADRAO' ? 'Fora do padrão' : a.tipo === 'ORCAMENTO' ? 'Orçamento' : a.tipo === 'SEM_COMPROVANTE' ? 'Sem comprovante' : 'Previsto'}
                                </span>
                                <span className="min-w-0 basis-full text-[14px] sm:basis-0 sm:flex-1">{a.texto}</span>
                                {a.titulo_id ? (
                                    <button type="button" className={`${BTN_PEQ} ml-auto`} onClick={() => setDetalhe(a.titulo_id!)}>
                                        Ver
                                    </button>
                                ) : (
                                    <Link href="/financeiro-config?aba=orcamento" className={`${BTN_PEQ} ml-auto`}>
                                        Ver orçamento
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}

                <div className={GRADE_CARTOES}>
                    {cartao('vencidos', 'Vencidos', cards?.vencidos, 'título(s)', false, true)}
                    {cartao('hoje', 'Vence hoje', cards?.hoje, 'título(s)', true)}
                    {cartao('semana', 'Próximos 7 dias', cards?.semana, 'título(s)')}
                    {cartao('pagos', 'Pago no mês', cards?.pagos_mes, 'pagamento(s)')}
                </div>

                {d?.faturas_abertas.map((f) => (
                    <Link key={f.conta_id} href="/cartao-credito" className={`${NOTA} items-center hover:bg-[#EEF2F7]`}>
                        <IconCreditCard size={18} className="shrink-0" />
                        <span className="min-w-0 flex-1">
                            {f.conta}: fatura aberta de <b>{brl(f.valor)}</b> ({f.lancamentos} lançamento(s)), fecha {diaMes(f.fechamento)} e vence {diaMes(f.vencimento)}.
                        </span>
                    </Link>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                    {(
                        [
                            ['aberto', 'Em aberto'],
                            ['vencidos', 'Vencidos'],
                            ['semana', 'Próximos 7 dias'],
                            ['previstos', 'Previstos'],
                            ['pagos', 'Pagos'],
                            ['cancelados', 'Cancelados'],
                            ['todos', 'Todos'],
                        ] as [Filtro, string][]
                    ).map(([k, r]) => (
                        <button key={k} type="button" className={PILULA(filtro === k)} onClick={() => setFiltro(k)}>
                            {r}
                        </button>
                    ))}
                    <div className="flex w-full flex-wrap gap-2 lg:ml-auto lg:w-auto">
                        <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl bg-white px-3 dark:bg-[#232B3F] lg:w-72">
                            <IconSearch size={18} className="text-[#5B6478]" />
                            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Fornecedor, descrição ou natureza" aria-label="Buscar" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                        </label>
                        <select className="h-11 min-w-0 flex-1 basis-full rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F] sm:basis-auto lg:flex-none" value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : '')} aria-label="Área">
                            <option value="">Todas as áreas</option>
                            {cad?.areas.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.nome}
                                </option>
                            ))}
                        </select>
                        <button type="button" className={`${BTN_PEQ} ${chips.length ? 'border-[#313C55] bg-[#E9EFF6]' : ''}`} onClick={() => setJanela('filtros')}>
                            <IconFilter size={18} /> Filtros{chips.length ? ` (${chips.length})` : ''}
                        </button>
                        <TrocaModo modo={modo} onModo={setModo} />
                        <button type="button" className={BTN_PEQ} onClick={() => void carregar()} aria-label="Atualizar">
                            <IconRefresh size={18} />
                        </button>
                    </div>
                </div>
                <ChipsFiltro chips={chips} onLimpar={() => setFa({})} />

                {modo === 'planilha' ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <b className="text-[15px]">{ordenada.length.toLocaleString('pt-BR')} título(s)</b>
                            <span className={`${SUB} font-bold`}>{brl(somaV)}</span>
                            <span className="flex-1" />
                            <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordem">
                                <option value="venc">Ordem: vencimento</option>
                                <option value="valor">Ordem: maior valor</option>
                                <option value="forn">Ordem: fornecedor</option>
                            </select>
                            <button type="button" className={BTN_PEQ} disabled={!selFiltro.length} onClick={() => marcar(selFiltro.map((t) => t.id), !todosFiltro)}>
                                {todosFiltro ? `Desmarcar os ${selFiltro.length}` : `Marcar os ${selFiltro.length} em aberto do filtro`}
                            </button>
                            <button type="button" className={BTN_PEQ} onClick={() => setJanela('colunas')}>
                                <IconColumns size={18} /> Colunas
                            </button>
                            <button
                                type="button"
                                className={BTN_PEQ}
                                disabled={!ordenada.length}
                                onClick={() => {
                                    baixarCsv(`contas-a-pagar-${hoje}.csv`, { rotulo: 'Fornecedor · descrição', texto: (t: Titulo) => `${t.pessoa ? t.pessoa + ' · ' : ''}${t.descricao}` }, COLUNAS, cols.vis, ordenada);
                                    avisar(`Planilha baixada com ${ordenada.length} título(s).`);
                                }}
                            >
                                <IconDownload size={18} /> Exportar
                            </button>
                        </div>
                        <Planilha
                            colunas={COLUNAS}
                            vis={cols.vis}
                            linhas={paginaLinhas}
                            carregando={carregando}
                            fixa={{
                                rotulo: 'Fornecedor · descrição',
                                valor: (t) => (
                                    <>
                                        <b className="line-clamp-2 break-words">{t.pessoa || '—'}</b>
                                        <span className={`${SUB} line-clamp-1`}>
                                            {t.descricao}
                                            {t.parcela ? ` · parcela ${t.parcela}` : ''}
                                        </span>
                                    </>
                                ),
                            }}
                            acoes={(t) => (
                                <>
                                    {t.situacao === 'PREVISTO' ? (
                                        <button type="button" className={BTN_PEQ} onClick={() => setConfirmar(t)}>
                                            Confirmar
                                        </button>
                                    ) : null}
                                    {t.situacao === 'ABERTO' && !pendentes[t.id] ? (
                                        <button type="button" className={BTN_PEQ_PRI} onClick={() => setPagar(t)}>
                                            Pagar
                                        </button>
                                    ) : null}
                                    {t.origem !== 'CARTAO' && t.situacao !== 'CANCELADO' ? (
                                        <button type="button" className={BTN_PEQ} onClick={() => setJanela({ acoes: t })}>
                                            Mais
                                        </button>
                                    ) : null}
                                </>
                            )}
                            selecionavel={selecionavel}
                            marcados={marc}
                            onMarcar={marcar}
                            onLinha={(t) => (t.situacao === 'CANCELADO' ? undefined : setDetalhe(t.id))}
                            rodape={{ rotulo: `Total do filtro · ${ordenada.length.toLocaleString('pt-BR')}`, valores: { valor: brl(somaV), enc: brl(somaJ), pago: brl(somaP) } }}
                        />
                        <Paginacao pagina={pagina} pp={pp} total={ordenada.length} onPagina={setPagina} onPp={setPp} />
                        <div className={SUB}>Role para o lado para ver todas as colunas. Fornecedor e Ações ficam fixos; o rodapé soma o filtro inteiro.</div>
                    </>
                ) : null}

                {marcados.length ? (
                    <BarraMassa>
                        <b>{marcados.length} marcado(s)</b>
                        <b className="text-[18px] tabular-nums">{brl(marcados.reduce((s, t) => s + t.valor, 0))}</b>
                        <span className="flex-1" />
                        <select className="h-11 min-w-0 rounded-xl bg-white px-3 text-[15px] text-[#313C55]" value={loteConta} onChange={(e) => setLoteConta(e.target.value ? Number(e.target.value) : '')} aria-label="Conta">
                            <option value="">Saiu da conta…</option>
                            {cad?.contas
                                .filter((c) => c.ativo && c.tipo !== 'CARTAO')
                                .map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                        </select>
                        <input type="date" className="h-11 rounded-xl bg-white px-3 text-[15px] text-[#313C55]" value={loteData || hoje} max={hoje} onChange={(e) => setLoteData(e.target.value)} aria-label="Data do pagamento" />
                        <button type="button" className="h-11 rounded-xl bg-white/15 px-4 font-extrabold" onClick={() => setMarc(new Set())}>
                            Limpar
                        </button>
                        <button type="button" className="h-11 rounded-xl bg-[#F2CB3F] px-4 font-extrabold text-[#313C55]" disabled={loteOcupado} onClick={() => void pagarLote()}>
                            Pagar {marcados.length}
                        </button>
                    </BarraMassa>
                ) : null}

                <div className={`${CARTAO} overflow-hidden ${modo === 'planilha' ? 'hidden' : ''}`}>
                    <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_130px_130px_120px_110px] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                        <span>Fornecedor</span>
                        <span>Natureza · rateio</span>
                        <span>Como pagar</span>
                        <span className="text-right">Valor</span>
                        <span>Situação</span>
                        <span />
                    </div>
                    {carregando && !d ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Carregando…</div> : null}
                    {d && !grupos.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhum título neste filtro.</div> : null}
                    {grupos.map((g) => {
                        const venc = g.dia < hoje && g.itens.some((t) => t.situacao !== 'PAGO');
                        return (
                            <div key={g.dia}>
                                <div className={`flex items-center gap-2 border-t border-[#E3E8F0] px-4 pb-1.5 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] dark:border-white/[0.08] ${venc ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>
                                    {diaSemana(g.dia)}, {diaMes(g.dia)}
                                    {g.dia === hoje ? ' · hoje' : venc ? ' · vencido' : ''}
                                    <span className="ml-auto">{brl(g.itens.reduce((s, t) => s + (t.baixa?.valor_pago ?? t.valor), 0))}</span>
                                </div>
                                {g.itens.map((t) => {
                                    const s = situacaoDe(t, hoje);
                                    return (
                                        <div
                                            key={t.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setDetalhe(t.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') setDetalhe(t.id);
                                            }}
                                            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-[#EEF2F7] px-4 py-3 hover:bg-[#F6F8FB] dark:border-white/[0.06] dark:hover:bg-white/[0.03] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_130px_130px_120px_110px] lg:items-center"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-extrabold">
                                                    <span className="break-words">{t.pessoa || '—'}</span>
                                                    {ORIGEM[t.origem] ? <span className={`${SELO} ${S_AB}`}>{ORIGEM[t.origem]}</span> : null}
                                                    {pendentes[t.id] ? <span className={`${SELO} ${S_AVISO}`}>Cancelamento pedido</span> : null}
                                                </div>
                                                <div className={`${SUB} line-clamp-2 break-words`}>
                                                    {t.descricao}
                                                    {t.parcela ? ` · parcela ${t.parcela}` : ''}
                                                </div>
                                            </div>
                                            <div className="text-right lg:hidden">
                                                <div className="text-[16px] font-extrabold tabular-nums">{brl(t.baixa?.valor_pago ?? t.valor)}</div>
                                                <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                                            </div>
                                            <div className="col-span-2 min-w-0 lg:col-span-1">
                                                <div className="line-clamp-2 break-words text-[14px] font-bold">
                                                    {t.rateio.length ? t.rateio[0].natureza + (t.rateio.length > 1 ? ` + ${t.rateio.length - 1}` : '') : t.origem === 'CARTAO' ? 'Compras com rateio próprio' : '—'}
                                                </div>
                                                <div className={`${SUB} line-clamp-1`}>{t.instalacao || [t.rateio[0]?.local, t.rateio[0]?.area, t.rateio[0]?.veiculo].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            <div className="hidden text-[14px] lg:block">
                                                {t.forma || '—'}
                                                {t.anexos ? (
                                                    <div className={`${SUB} flex items-center gap-1`}>
                                                        <IconPaperclip size={13} /> {t.anexos}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="hidden text-right lg:block">
                                                <div className="text-[15px] font-extrabold tabular-nums">{brl(t.baixa?.valor_pago ?? t.valor)}</div>
                                                {t.baixa ? <div className={SUB}>{t.baixa.conta}</div> : null}
                                            </div>
                                            <div className="hidden lg:block">
                                                <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                                            </div>
                                            <div className="col-span-2 flex justify-end gap-2 lg:col-span-1" onClick={(e) => e.stopPropagation()}>
                                                {t.situacao === 'PREVISTO' ? (
                                                    <button type="button" className={BTN_PEQ} onClick={() => setConfirmar(t)}>
                                                        Confirmar
                                                    </button>
                                                ) : null}
                                                {t.situacao === 'ABERTO' && !pendentes[t.id] ? (
                                                    <button type="button" className={BTN_PEQ_PRI} onClick={() => setPagar(t)}>
                                                        Pagar
                                                    </button>
                                                ) : null}
                                                {t.origem !== 'CARTAO' && t.situacao !== 'CANCELADO' ? (
                                                    <button type="button" className={BTN_PEQ} onClick={() => setJanela({ acoes: t })}>
                                                        Mais
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
                <div className={SUB}>Lançamento em paralelo com a Unymos até a virada. Sem etapa de autorização: quem tem acesso registra o pagamento. Nada é apagado: cancelamentos e estornos ficam no histórico.</div>
            </div>

            {novo && cad ? (
                <NovoTitulo
                    cad={cad}
                    editar={novo.editar}
                    onFechar={() => setNovo(null)}
                    onSalvo={(m) => {
                        setNovo(null);
                        avisar(m);
                        void carregar();
                        void recarregarCad();
                    }}
                />
            ) : null}
            {pagar && cad ? (
                <Pagar
                    cad={cad}
                    t={pagar}
                    hoje={hoje}
                    onFechar={() => setPagar(null)}
                    onPago={(m) => {
                        setPagar(null);
                        avisar(m);
                        void carregar();
                    }}
                />
            ) : null}
            {confirmar ? (
                <Confirmar
                    t={confirmar}
                    onFechar={() => setConfirmar(null)}
                    onFeito={(m) => {
                        setConfirmar(null);
                        avisar(m);
                        void carregar();
                    }}
                />
            ) : null}
            {detalhe !== null ? (
                <DetalheTitulo
                    id={detalhe}
                    hoje={hoje}
                    onFechar={() => setDetalhe(null)}
                    onMudou={(m) => {
                        avisar(m);
                        void carregar();
                    }}
                    onEditar={(t) => {
                        setDetalhe(null);
                        setNovo({ editar: t });
                    }}
                    onPagar={(t) => {
                        setDetalhe(null);
                        setPagar(t);
                    }}
                    onConfirmar={(t) => {
                        setDetalhe(null);
                        setConfirmar(t);
                    }}
                    pendente={pendentes[detalhe] ?? null}
                />
            ) : null}
            {janela === 'filtros' && d ? (
                <FiltrosPagar
                    fa={fa}
                    titulos={[...d.titulos, ...cancelados]}
                    onFechar={() => setJanela(null)}
                    onAplicar={(f) => {
                        setFa(f);
                        setJanela(null);
                    }}
                />
            ) : null}
            {janela === 'colunas' ? <JanelaColunas colunas={COLUNAS} vis={cols.vis} onMudar={cols.setVis} onPadrao={cols.voltarPadrao} onFechar={() => setJanela(null)} fixas="Fornecedor e Ações" /> : null}
            {janela && typeof janela === 'object' && cad ? (
                <AcoesPagar
                    cad={cad}
                    t={janela.acoes}
                    pendente={pendentes[janela.acoes.id] ?? null}
                    onFechar={() => setJanela(null)}
                    onMudou={(m) => {
                        setJanela(null);
                        avisar(m);
                        void carregar();
                    }}
                />
            ) : null}
            {aviso}
        </div>
    );
}

/* ============================== novo título ============================== */

function NovoTitulo({ cad, editar, onFechar, onSalvo }: { cad: Cadastros; editar?: Titulo; onFechar: () => void; onSalvo: (msg: string) => void }) {
    const hoje = hojeISO();
    const forn = cad.pessoas.filter((p) => p.fornecedor && p.ativo);
    const [inst, setInst] = useState<number | ''>(editar?.instalacao_id ?? '');
    const [pessoa, setPessoa] = useState<number | '' | 'novo'>(editar?.pessoa_id ?? '');
    const [pessoaNome, setPessoaNome] = useState('');
    const [desc, setDesc] = useState(editar?.descricao ?? '');
    const [doc, setDoc] = useState(editar?.documento ?? '');
    const [valor, setValor] = useState(editar ? numCampo(editar.valor) : '');
    const [emissao, setEmissao] = useState(editar?.emissao ?? hoje);
    const [comp, setComp] = useState(editar?.competencia ?? hoje.slice(0, 7));
    const [venc, setVenc] = useState(editar?.vencimento ?? diaMais(hoje, 10));
    const [parcelas, setParcelas] = useState(1);
    const [forma, setForma] = useState<number | ''>(editar?.forma_id ?? cad.formas.find((f) => f.codigo === 'BOLETO')?.id ?? '');
    const [linha, setLinha] = useState(editar?.linha_digitavel ?? '');
    const [previsto, setPrevisto] = useState(editar?.situacao === 'PREVISTO');
    const [repete, setRepete] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [linhas, setLinhas] = useState<LinhaEdicao[]>(
        editar?.rateio.length
            ? editar.rateio.map((r) => ({ natureza_id: r.natureza_id, local_id: r.local_id, area_id: r.area_id, veiculo_id: r.veiculo_id, valor: numCampo(r.valor) }))
            : [linhaVazia()],
    );
    const [erro, setErro] = useState<string | null>(null);
    const [duplicado, setDuplicado] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const total = paraNumero(valor);
    const formaSel = cad.formas.find((f) => f.id === forma);

    const escolherInst = (id: number | '') => {
        setInst(id);
        const i = cad.instalacoes.find((x) => x.id === id);
        if (!i) return;
        setPessoa(i.pessoa_id);
        setDesc(`Fatura ${comp.slice(5, 7)}/${comp.slice(0, 4)}`);
        if (!cad.recorrentes.some((r) => r.instalacao_id === i.id && r.situacao !== 'ENCERRADA')) setRepete(true);
        if (i.dia_vencimento) setVenc(`${comp}-${String(i.dia_vencimento).padStart(2, '0')}`);
        setLinhas([{ natureza_id: i.natureza_id, local_id: i.local_id, area_id: i.area_id, veiculo_id: null, valor: valor }]);
    };
    const escolherPessoa = (v: string) => {
        const id = v === 'novo' ? 'novo' : v ? Number(v) : '';
        setPessoa(id);
        const p = cad.pessoas.find((x) => x.id === id);
        if (p?.natureza_padrao_id && linhas.length === 1 && !linhas[0].natureza_id) setLinhas([{ ...linhas[0], natureza_id: p.natureza_padrao_id }]);
    };
    const mudarValor = (v: string) => {
        setValor(v);
        if (linhas.length === 1) setLinhas([{ ...linhas[0], valor: v }]);
    };

    const salvar = async (forcar = false) => {
        setErro(null);
        if (!pessoa || (pessoa === 'novo' && !pessoaNome.trim())) return setErro('Escolha o fornecedor.');
        if (!total || Number.isNaN(total) || total <= 0) return setErro('Informe o valor total.');
        const r = rateioParaEnvio(linhas);
        if (!r.ok) return setErro(r.msg);
        setSalvando(true);
        try {
            const j = await api(URL_PAGAR, 'salvar', {
                id: editar?.id,
                pessoa_id: pessoa === 'novo' ? null : pessoa,
                pessoa_nome: pessoa === 'novo' ? pessoaNome.trim() : null,
                descricao: desc,
                documento: doc,
                emissao,
                competencia: comp,
                vencimento: venc,
                valor: total,
                parcelas,
                forma_id: forma || null,
                linha_digitavel: formaSel?.codigo === 'BOLETO' ? linha : null,
                previsto,
                repete,
                instalacao_id: inst || null,
                rateio: r.linhas,
                forcar_duplicado: forcar,
            });
            if (arquivo && j.dados?.ids?.[0]) {
                try {
                    await enviarAnexo({ titulo_id: j.dados.ids[0] }, arquivo);
                } catch (e: any) {
                    onSalvo(`${j.msg} O arquivo não foi anexado: ${e?.message || 'tente de novo no detalhe do título.'}`);
                    return;
                }
            }
            onSalvo(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) {
                setErro(m);
                setDuplicado(!!e?.duplicado);
            }
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela
            titulo={editar ? 'Alterar título' : 'Novo título a pagar'}
            largura="max-w-4xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    {duplicado ? (
                        <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => void salvar(true)}>
                            Lançar mesmo assim
                        </button>
                    ) : null}
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                        {salvando ? 'Salvando…' : editar ? 'Salvar alteração' : parcelas > 1 ? `Lançar ${parcelas} parcelas` : 'Lançar título'}
                    </button>
                </>
            }
        >
            {!editar && cad.instalacoes.some((i) => i.ativo) ? (
                <div>
                    <label className={ROTULO}>Instalação de consumo (opcional)</label>
                    <select className={CAMPO} value={inst} onChange={(e) => escolherInst(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Não é conta de consumo</option>
                        {cad.instalacoes.filter((i) => i.ativo).map((i) => (
                            <option key={i.id} value={i.id}>
                                {i.pessoa} · {i.local} · {i.numero}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
                <div>
                    <label className={ROTULO}>Fornecedor</label>
                    <select className={CAMPO} value={pessoa} onChange={(e) => escolherPessoa(e.target.value)}>
                        <option value="">Escolha</option>
                        {forn.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.nome}
                            </option>
                        ))}
                        <option value="novo">+ Novo fornecedor</option>
                    </select>
                    {pessoa === 'novo' ? <input className={`${CAMPO} mt-2`} value={pessoaNome} onChange={(e) => setPessoaNome(e.target.value)} placeholder="Nome do novo fornecedor" autoFocus /> : null}
                </div>
                <div>
                    <label className={ROTULO}>Descrição</label>
                    <input className={CAMPO} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: NF 4600 · urnas" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                    <label className={ROTULO}>Valor total</label>
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => mudarValor(e.target.value)} placeholder="0,00" />
                </div>
                <div>
                    <label className={ROTULO}>Nº do documento</label>
                    <input className={CAMPO} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="NF, fatura…" />
                </div>
                <div>
                    <label className={ROTULO}>Emissão</label>
                    <input className={CAMPO} type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Competência</label>
                    <input className={CAMPO} type="month" value={comp} onChange={(e) => setComp(e.target.value)} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                    <label className={ROTULO}>{parcelas > 1 ? '1º vencimento' : 'Vencimento'}</label>
                    <input className={CAMPO} type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
                </div>
                {!editar ? (
                    <div>
                        <label className={ROTULO}>Parcelas</label>
                        <select className={CAMPO} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 24].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
                <div>
                    <label className={ROTULO}>Como pagar</label>
                    <select className={CAMPO} value={forma} onChange={(e) => setForma(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {cad.formas.filter((f) => f.ativo && f.codigo !== 'CARTAO_CREDITO').map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.nome}
                            </option>
                        ))}
                    </select>
                </div>
                {formaSel?.codigo === 'BOLETO' ? (
                    <div className={editar ? 'col-span-2 lg:col-span-2' : ''}>
                        <label className={ROTULO}>Linha digitável</label>
                        <input className={CAMPO} inputMode="numeric" value={linha} onChange={(e) => setLinha(e.target.value)} placeholder="Cole ou digite" />
                    </div>
                ) : null}
            </div>
            {parcelas > 1 && total ? (
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: parcelas }, (_, i) => {
                        const base = Math.floor((total / parcelas) * 100) / 100;
                        const v = i === parcelas - 1 ? total - base * (parcelas - 1) : base;
                        const [a, m, dd] = venc.split('-').map(Number);
                        const dt = new Date(a, m - 1 + i, 1);
                        const ult = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
                        return (
                            <span key={i} className={`${SELO} ${S_AB} py-1.5`}>
                                {i + 1}ª · {String(Math.min(dd, ult)).padStart(2, '0')}/{String(dt.getMonth() + 1).padStart(2, '0')} · {brl(v)}
                            </span>
                        );
                    })}
                </div>
            ) : null}

            <EditorRateio cad={cad} linhas={linhas} setLinhas={setLinhas} total={total} />

            <div className="grid gap-2 lg:grid-cols-3">
                <Marcar on={previsto} onClick={() => setPrevisto(!previsto)} rotulo="Previsto (valor ainda não confirmado)" />
                {!editar ? <Marcar on={repete} onClick={() => setRepete(!repete)} rotulo="Repete todo mês" icone={<IconRepeat size={16} />} /> : <span />}
                {!editar ? (
                    <BotaoArquivo
                        rotulo={arquivo ? arquivo.name : 'Anexar nota ou boleto'}
                        onArquivo={setArquivo}
                        classe="flex min-h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3.5 text-left text-[14.5px] font-bold dark:bg-[#1C2334]"
                        icone={<IconPaperclip size={18} />}
                    />
                ) : null}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function Marcar({ on, onClick, rotulo, icone }: { on: boolean; onClick: () => void; rotulo: string; icone?: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-[#F1F4F8] px-3.5 text-left text-[14.5px] font-bold dark:bg-[#1C2334]" aria-pressed={on}>
            <span className={`grid size-[22px] shrink-0 place-items-center rounded-md border-2 ${on ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border-[#C9D1DE] bg-white dark:bg-transparent'}`}>
                {on ? '✓' : ''}
            </span>
            {icone}
            {rotulo}
        </button>
    );
}

/* ============================== pagar ============================== */

function Pagar({ cad, t, hoje, onFechar, onPago }: { cad: Cadastros; t: Titulo; hoje: string; onFechar: () => void; onPago: (m: string) => void }) {
    const contas = cad.contas.filter((c) => c.ativo && c.tipo !== 'CARTAO');
    const sugerida = t.fatura_conta_id ? cad.contas.find((c) => c.id === t.fatura_conta_id)?.cartao_conta_pagamento_id ?? '' : '';
    const [data, setData] = useState(hoje);
    const [conta, setConta] = useState<number | ''>(sugerida || '');
    const [juros, setJuros] = useState('');
    const [multa, setMulta] = useState('');
    const [desc, setDesc] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const pago = t.valor + (paraNumero(juros) || 0) + (paraNumero(multa) || 0) - (paraNumero(desc) || 0);

    const confirmar = async () => {
        setErro(null);
        if (!conta) return setErro('Escolha a conta de onde saiu o dinheiro.');
        if (t.exige_comprovante && !arquivo) return setErro(`${t.forma} exige comprovante: anexe a foto ou o PDF.`);
        setSalvando(true);
        try {
            const j = await api(URL_PAGAR, 'pagar', { id: t.id, data, conta_id: conta, juros, multa, desconto: desc });
            if (arquivo) {
                try {
                    await enviarAnexo({ baixa_id: j.dados.baixa_id }, arquivo);
                } catch (e: any) {
                    onPago(`Pagamento registrado, mas o comprovante não foi anexado: ${e?.message || 'anexe pelo detalhe do título.'}`);
                    return;
                }
            }
            onPago(`Pagamento de ${brl(j.dados.valor_pago)} registrado.`);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível registrar o pagamento.');
            if (m) setErro(m);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela
            titulo="Registrar pagamento"
            sub={`${t.pessoa} · ${t.descricao}`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void confirmar()}>
                        {salvando ? 'Registrando…' : 'Confirmar pagamento'}
                    </button>
                </>
            }
        >
            <div className={NOTA}>
                Valor do título: <b>{brl(t.valor)}</b> · vence {dataBR(t.vencimento)}
                {t.linha_digitavel ? ` · linha ${t.linha_digitavel}` : ''}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                <div>
                    <label className={ROTULO}>Data do pagamento</label>
                    <input className={CAMPO} type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Saiu da conta</label>
                    <select className={CAMPO} value={conta} onChange={(e) => setConta(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Escolha</option>
                        {contas.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                {(
                    [
                        ['Juros', juros, setJuros],
                        ['Multa', multa, setMulta],
                        ['Desconto', desc, setDesc],
                    ] as [string, string, (v: string) => void][]
                ).map(([r, v, f]) => (
                    <div key={r}>
                        <label className={ROTULO}>{r}</label>
                        <input className={CAMPO} inputMode="decimal" value={v} onChange={(e) => f(e.target.value)} placeholder="0,00" />
                    </div>
                ))}
            </div>
            <div className={`${NOTA} ${S_OK} text-[16px]`}>
                Valor pago: <b>{brl(pago)}</b>
            </div>
            <BotaoArquivo
                rotulo={arquivo ? arquivo.name : t.exige_comprovante ? 'Anexar comprovante (obrigatório)' : 'Anexar comprovante'}
                onArquivo={setArquivo}
                classe="flex min-h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3.5 text-left text-[14.5px] font-bold dark:bg-[#1C2334]"
                icone={<IconPaperclip size={18} />}
            />
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== confirmar previsto ============================== */

function Confirmar({ t, onFechar, onFeito }: { t: Titulo; onFechar: () => void; onFeito: (m: string) => void }) {
    const [valor, setValor] = useState(numCampo(t.valor));
    const [venc, setVenc] = useState(t.vencimento);
    const [linha, setLinha] = useState(t.linha_digitavel ?? '');
    const [erro, setErro] = useState<string | null>(null);
    const [dup, setDup] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const ir = async (forcar = false) => {
        setErro(null);
        setSalvando(true);
        try {
            const j = await api(URL_PAGAR, 'confirmar', { id: t.id, valor, vencimento: venc, linha_digitavel: linha, forcar_duplicado: forcar });
            onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível confirmar.');
            if (m) {
                setErro(m);
                setDup(!!e?.duplicado);
            }
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo="Confirmar conta prevista"
            sub={`${t.pessoa} · ${t.descricao}`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    {dup ? (
                        <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => void ir(true)}>
                            Confirmar mesmo assim
                        </button>
                    ) : null}
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void ir()}>
                        Confirmar valor
                    </button>
                </>
            }
        >
            <div className={NOTA}>Previsto: {brl(t.valor)}. Quando a fatura chegar, informe o valor real; o rateio é ajustado na mesma proporção.</div>
            <div className="grid gap-3 lg:grid-cols-2">
                <div>
                    <label className={ROTULO}>Valor da conta</label>
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Vencimento</label>
                    <input className={CAMPO} type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
                </div>
            </div>
            <div>
                <label className={ROTULO}>Linha digitável (se for boleto)</label>
                <input className={CAMPO} inputMode="numeric" value={linha} onChange={(e) => setLinha(e.target.value)} placeholder="Cole ou digite" />
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== detalhe ============================== */

function DetalheTitulo({
    id,
    hoje,
    onFechar,
    onMudou,
    onEditar,
    onPagar,
    onConfirmar,
    pendente,
}: {
    id: number;
    hoje: string;
    onFechar: () => void;
    onMudou: (m: string) => void;
    onEditar: (t: Titulo) => void;
    onPagar: (t: Titulo) => void;
    onConfirmar: (t: Titulo) => void;
    pendente: Pendente | null;
}) {
    const [t, setT] = useState<Detalhe | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [motivo, setMotivo] = useState('');
    const [acao, setAcao] = useState<'estornar' | 'cancelar' | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_PAGAR, 'titulo', undefined, `&id=${id}`);
            setT(j.dados);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível abrir o título.');
            if (m) setErro(m);
        }
    }, [id]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const executar = async () => {
        if (!acao || !t) return;
        if (!motivo.trim()) return setErro('Informe o motivo.');
        setOcupado(true);
        setErro(null);
        try {
            // 12/11/2026: cancelar passa pela Gestão (pedido); estornar continua direto
            const j = acao === 'cancelar' ? await api(URL_ACOES, 'pedir_cancelamento', { id: t.id, motivo }) : await api(URL_PAGAR, acao, { id: t.id, motivo });
            onMudou(j.msg);
            setAcao(null);
            setMotivo('');
            if (acao === 'cancelar') onFechar();
            else void carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const anexar = async (f: File) => {
        if (!t) return;
        setOcupado(true);
        setErro(null);
        try {
            const j = await enviarAnexo(t.situacao === 'PAGO' && t.baixa ? { baixa_id: t.baixa.id } : { titulo_id: t.id }, f);
            onMudou(j.msg);
            void carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível anexar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    const s = t ? situacaoDe(t, hoje) : null;
    const podeAlterar = t && (t.situacao === 'PREVISTO' || t.situacao === 'ABERTO') && t.origem !== 'CARTAO' && !pendente;

    return (
        <Janela
            titulo={t ? t.pessoa || 'Título' : 'Título'}
            sub={t ? `${t.descricao}${t.parcela ? ` · parcela ${t.parcela}` : ''}` : 'Carregando…'}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                t ? (
                    <>
                        {podeAlterar ? (
                            <button type="button" className={BTN_SEC} onClick={() => setAcao('cancelar')}>
                                <IconBan size={18} /> Pedir cancelamento
                            </button>
                        ) : null}
                        {t.situacao === 'PAGO' ? (
                            <button type="button" className={BTN_SEC} onClick={() => setAcao('estornar')}>
                                <IconArrowBackUp size={18} /> Estornar pagamento
                            </button>
                        ) : null}
                        {podeAlterar ? (
                            <button type="button" className={BTN_SEC} onClick={() => onEditar(t)}>
                                <IconPencil size={18} /> Alterar
                            </button>
                        ) : null}
                        {t.situacao === 'PREVISTO' ? (
                            <button type="button" className={BTN_PRI} onClick={() => onConfirmar(t)}>
                                Confirmar valor
                            </button>
                        ) : null}
                        {t.situacao === 'ABERTO' && !pendente ? (
                            <button type="button" className={BTN_PRI} onClick={() => onPagar(t)}>
                                Pagar
                            </button>
                        ) : null}
                    </>
                ) : null
            }
        >
            {!t && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {t && s ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                        {ORIGEM[t.origem] ? <span className={`${SELO} ${S_AB}`}>{ORIGEM[t.origem]}</span> : null}
                        <span className="ml-auto text-[24px] font-extrabold tabular-nums">{brl(t.valor)}</span>
                    </div>
                    {pendente ? <div className={`${NOTA} ${S_AVISO}`}>Cancelamento pedido · motivo: {pendente.motivo}. Está na aba Aprovações da Tesouraria, esperando a Gestão.</div> : null}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] lg:grid-cols-4">
                        <Info r="Vencimento" v={dataBR(t.vencimento)} />
                        <Info r="Competência" v={`${t.competencia.slice(5)}/${t.competencia.slice(0, 4)}`} />
                        <Info r="Como pagar" v={t.forma || '—'} />
                        <Info r="Documento" v={t.documento || '—'} />
                        {t.instalacao ? <Info r="Instalação" v={t.instalacao} /> : null}
                        {t.linha_digitavel ? (
                            <div className="col-span-2">
                                <Info r="Linha digitável" v={t.linha_digitavel} />
                            </div>
                        ) : null}
                    </div>

                    {t.rateio.length ? (
                        <div className={`${CARTAO} overflow-hidden`}>
                            <div className="bg-[#F6F8FB] px-3.5 py-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">Rateio</div>
                            {t.rateio.map((r, i) => (
                                <div key={i} className="flex items-start gap-3 border-t border-[#EEF2F7] px-3.5 py-2.5 text-[14px] dark:border-white/[0.06]">
                                    <div className="min-w-0 flex-1">
                                        <b>{r.natureza}</b>
                                        <div className={SUB}>{[r.local, r.area, r.veiculo].filter(Boolean).join(' · ') || '—'}</div>
                                    </div>
                                    <span className="font-extrabold tabular-nums">{brl(r.valor)}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {t.compras?.length ? (
                        <div className={`${CARTAO} overflow-hidden`}>
                            <div className="bg-[#F6F8FB] px-3.5 py-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">Compras desta fatura</div>
                            {t.compras.map((c, i) => (
                                <div key={i} className="flex gap-3 border-t border-[#EEF2F7] px-3.5 py-2 text-[14px] dark:border-white/[0.06]">
                                    <span className="w-12 shrink-0">{diaMes(c.data)}</span>
                                    <span className="min-w-0 flex-1">
                                        {c.descricao}
                                        {c.parcela ? ` · ${c.parcela}` : ''}
                                    </span>
                                    <b className="tabular-nums">{brl(c.valor)}</b>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {t.baixas.length ? (
                        <div className="flex flex-col gap-1.5">
                            <div className={ROTULO}>Pagamentos</div>
                            {t.baixas.map((b) => (
                                <div key={b.id} className={`${NOTA} ${b.estornado_em ? 'opacity-70' : S_OK}`}>
                                    <span>
                                        {dataBR(b.data)} · <b>{brl(b.valor_pago)}</b>
                                        {b.juros || b.multa ? ` (juros ${brl(b.juros)}, multa ${brl(b.multa)})` : ''}
                                        {b.desconto ? ` (desconto ${brl(b.desconto)})` : ''} · {b.por || '—'}
                                        {b.estornado_em ? ` · estornado em ${dataBR(b.estornado_em)} por ${b.estornado_por || '—'}: ${b.estorno_motivo || ''}` : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                            <span className={ROTULO}>Anexos</span>
                            <span className="ml-auto">
                                <BotaoArquivo rotulo={t.situacao === 'PAGO' ? 'Anexar comprovante' : 'Anexar arquivo'} onArquivo={(f) => void anexar(f)} icone={<IconPaperclip size={16} />} />
                            </span>
                        </div>
                        {t.anexos_lista.length ? (
                            t.anexos_lista.map((a) => (
                                <a key={a.id} href={urlAnexo(a.id)} target="_blank" rel="noreferrer" className={`${NOTA} items-center hover:underline`}>
                                    <IconPaperclip size={16} className="shrink-0" />
                                    <span className="min-w-0 flex-1 break-words">{a.nome}</span>
                                    {a.comprovante ? <span className={`${SELO} ${S_OK}`}>comprovante</span> : null}
                                </a>
                            ))
                        ) : (
                            <div className={SUB}>Nenhum arquivo.{t.exige_comprovante && t.situacao === 'PAGO' ? ' Esta forma de pagamento exige comprovante.' : ''}</div>
                        )}
                    </div>

                    {t.historico.length ? (
                        <div className={SUB}>
                            {t.historico.map((h, i) => (
                                <div key={i}>
                                    {dataBR(h.criado_em)} {h.criado_em.slice(11, 16)} · {ACAO[h.acao] || h.acao} · {h.nome || 'automático'}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {acao ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-[#F4B4AE] p-3">
                            <label className={ROTULO}>{acao === 'estornar' ? 'Motivo do estorno' : 'Motivo do cancelamento'}</label>
                            <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                            <div className="flex justify-end gap-2">
                                <button type="button" className={BTN_PEQ} onClick={() => setAcao(null)}>
                                    Desistir
                                </button>
                                <button type="button" className={BTN_PEQ_PRI} disabled={ocupado} onClick={() => void executar()}>
                                    {acao === 'estornar' ? 'Estornar' : 'Pedir à Gestão'}
                                </button>
                            </div>
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

/* ============================== filtros avançados (12/11/2026) ============================== */

function FiltrosPagar({ fa, titulos, onFechar, onAplicar }: { fa: FAP; titulos: Titulo[]; onFechar: () => void; onAplicar: (f: FAP) => void }) {
    const [f, setF] = useState<FAP>({ td: 'venc', ...fa });
    const set = (k: keyof FAP) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
    const uniq = (l: (string | null | undefined)[]) => Array.from(new Set(l.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
    const opcoes = useMemo(
        () => ({
            pessoas: uniq(titulos.map((t) => t.pessoa)),
            naturezas: uniq(titulos.flatMap((t) => t.rateio.map((r) => r.natureza))),
            formas: uniq(titulos.map((t) => t.forma)),
            contas: uniq(titulos.map((t) => t.baixa?.conta)),
        }),
        [titulos],
    );
    const sel = (k: keyof FAP, rotulo: string, lista: string[], todos = 'Todos') => (
        <label className="flex min-w-0 flex-col">
            <span className={ROTULO}>{rotulo}</span>
            <select className={CAMPO} value={f[k] || ''} onChange={set(k)}>
                <option value="">{todos}</option>
                {lista.map((x) => (
                    <option key={x}>{x}</option>
                ))}
            </select>
        </label>
    );
    const inp = (k: keyof FAP, rotulo: string, tipo = 'text', ph = '') => (
        <label className="flex min-w-0 flex-col">
            <span className={ROTULO}>{rotulo}</span>
            <input className={CAMPO} type={tipo} value={f[k] || ''} onChange={set(k)} placeholder={ph} inputMode={tipo === 'text' && ph === '0,00' ? 'decimal' : undefined} />
        </label>
    );
    return (
        <Janela
            titulo="Filtros"
            sub="Valem para a lista e para a planilha, junto com a busca, a área e os botões de situação."
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
                            const n: FAP = {};
                            (Object.keys(f) as (keyof FAP)[]).forEach((k) => {
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
                <label className="flex min-w-0 flex-col">
                    <span className={ROTULO}>Data de</span>
                    <select className={CAMPO} value={f.td || 'venc'} onChange={set('td')}>
                        <option value="venc">Vencimento</option>
                        <option value="emis">Emissão</option>
                        <option value="comp">Competência</option>
                        <option value="pago">Pagamento</option>
                    </select>
                </label>
                {inp('de', 'De', 'date')}
                {inp('ate', 'Até', 'date')}
            </div>
            <div className={ROTULO}>Título</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sel('pessoa', 'Fornecedor', opcoes.pessoas)}
                {sel('natureza', 'Natureza', opcoes.naturezas, 'Todas')}
                {inp('doc', 'Documento / NF', 'text', 'Número da nota ou boleto')}
                {inp('vmin', 'Valor de', 'text', '0,00')}
                {inp('vmax', 'Valor até', 'text', '0,00')}
                <label className="flex min-w-0 flex-col">
                    <span className={ROTULO}>Anexo</span>
                    <select className={CAMPO} value={f.anexo || ''} onChange={set('anexo')}>
                        <option value="">Todos</option>
                        <option value="com">Com anexo</option>
                        <option value="sem">Sem anexo</option>
                    </select>
                </label>
            </div>
            <div className={ROTULO}>Pagamento</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sel('forma', 'Forma', opcoes.formas, 'Todas')}
                {sel('conta', 'Saiu da conta', opcoes.contas, 'Todas')}
            </div>
        </Janela>
    );
}

/* ============================== mais ações (12/11/2026) ============================== */

function AcoesPagar({ cad, t, pendente, onFechar, onMudou }: { cad: Cadastros; t: Titulo; pendente: Pendente | null; onFechar: () => void; onMudou: (m: string) => void }) {
    const aberto = (t.situacao === 'ABERTO' || t.situacao === 'PREVISTO') && !pendente;
    const [aba, setAba] = useState(aberto ? 'prorrogar' : 'historico');
    const [venc, setVenc] = useState(t.vencimento);
    const [motivo, setMotivo] = useState('');
    const [nat, setNat] = useState<number | null>(t.rateio.length === 1 ? t.rateio[0].natureza_id : null);
    const [hist, setHist] = useState<{ acao: string; criado_em: string; nome: string | null }[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        if (aba !== 'historico' || hist) return;
        void (async () => {
            try {
                const j = await api(URL_PAGAR, 'titulo', undefined, `&id=${t.id}`);
                setHist(j.dados.historico);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar o histórico.');
                if (m) setErro(m);
            }
        })();
    }, [aba, hist, t.id]);
    const enviar = async (acao: string, corpo: Record<string, unknown>) => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_ACOES, acao, { id: t.id, ...corpo });
            onMudou(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const abas: [string, string][] = [
        ...((aberto ? [['prorrogar', 'Prorrogar vencimento']] : []) as [string, string][]),
        ...((t.situacao !== 'CANCELADO' && t.rateio.length === 1 ? [['natureza', 'Alterar natureza']] : []) as [string, string][]),
        ...((aberto ? [['cancelar', 'Cancelar']] : []) as [string, string][]),
        ['historico', 'Histórico'],
    ];
    return (
        <Janela titulo={t.pessoa || 'Título'} sub={`${t.descricao}${t.parcela ? ` · parcela ${t.parcela}` : ''} · ${brl(t.valor)} · vence ${dataBR(t.vencimento)}`} onFechar={onFechar}>
            <div className="flex flex-wrap gap-2">
                {abas.map(([k, r]) => (
                    <button key={k} type="button" className={PILULA(aba === k)} onClick={() => setAba(k)}>
                        {r}
                    </button>
                ))}
            </div>
            {pendente ? <div className={`${NOTA} ${S_AVISO}`}>Cancelamento pedido · motivo: {pendente.motivo}. Está na aba Aprovações da Tesouraria, esperando a Gestão.</div> : null}
            {aba === 'prorrogar' ? (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col">
                            <span className={ROTULO}>Vencimento atual</span>
                            <div className={`${CAMPO} flex items-center font-extrabold`}>{dataBR(t.vencimento)}</div>
                        </label>
                        <label className="flex flex-col">
                            <span className={ROTULO}>Novo vencimento</span>
                            <input type="date" className={CAMPO} value={venc} onChange={(e) => setVenc(e.target.value)} />
                        </label>
                    </div>
                    <label className="flex flex-col">
                        <span className={ROTULO}>Motivo (opcional)</span>
                        <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: boleto novo, acordo com o fornecedor" />
                    </label>
                    <div className="flex justify-end">
                        <button type="button" className={BTN_PRI} disabled={ocupado || venc === t.vencimento} onClick={() => void enviar('prorrogar', { vencimento: venc, motivo })}>
                            Prorrogar
                        </button>
                    </div>
                </>
            ) : null}
            {aba === 'natureza' ? (
                <>
                    <label className="flex flex-col">
                        <span className={ROTULO}>Nova natureza (atual: {t.rateio[0]?.natureza})</span>
                        <SelectNatureza cad={cad} value={nat} onChange={setNat} classe={CAMPO} />
                    </label>
                    <div className={SUB}>Num mês já fechado a troca não é aceita (o DRE daquele mês não muda).</div>
                    <div className="flex justify-end">
                        <button type="button" className={BTN_PRI} disabled={ocupado || !nat} onClick={() => void enviar('natureza', { natureza_id: nat })}>
                            Alterar natureza
                        </button>
                    </div>
                </>
            ) : null}
            {aba === 'cancelar' ? (
                <>
                    <label className="flex flex-col">
                        <span className={ROTULO}>Motivo do cancelamento</span>
                        <select className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                            <option value="">Escolha o motivo</option>
                            <option>Lançado em duplicidade</option>
                            <option>Valor lançado errado</option>
                            <option>Fornecedor cancelou a cobrança</option>
                            <option>Outro</option>
                        </select>
                    </label>
                    <div className={`${NOTA} ${S_AVISO}`}>O cancelamento vai para a Gestão (aba Aprovações da Tesouraria). Até lá o título fica &quot;Cancelamento pedido&quot; e não pode ser pago.</div>
                    <div className="flex justify-end">
                        <button type="button" className={BTN_PRI} disabled={ocupado || !motivo} onClick={() => void enviar('pedir_cancelamento', { motivo })}>
                            Pedir cancelamento
                        </button>
                    </div>
                </>
            ) : null}
            {aba === 'historico' ? (
                hist ? (
                    hist.length ? (
                        <div className="flex flex-col gap-1.5">
                            {hist
                                .slice()
                                .reverse()
                                .map((h, i) => (
                                    <div key={i} className="rounded-xl border border-[#EEF2F7] px-3 py-2 text-[14px] dark:border-white/[0.08]">
                                        <b>{ACAO[h.acao] || h.acao}</b>
                                        <div className={SUB}>
                                            {dataBR(h.criado_em)} {h.criado_em.slice(11, 16)} · {h.nome || 'automático'}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div className={SUB}>Sem registros.</div>
                    )
                ) : (
                    <div className="py-4 text-center text-[#5B6478]">Carregando…</div>
                )
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}
