'use client';

/**
 * Peças comuns das telas Planos (/contratos-planos) e Regras (/contratos-regras) — módulo Contratos, fase 1 — 18/11/2026.
 * Back-end: pl_planos.php. Estilos, janela e chamadas vêm do financeiro (contas-pagar/components/fin.tsx).
 * Os campos de cada tipo de regra ficam em CAMPOS_TIPO: a regra guarda os parâmetros em JSON (pl_regra_versao.parametros).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { api, CAMPO_P, mensagemErro, ROTULO, S_AB, S_AVISO, S_MUDO, S_OK, S_RUIM, SELO } from '../../contas-pagar/components/fin';

export const URL_PL = 'https://api.planoassistencialintegrado.com.br/pl_planos.php';

/* ============================== tipos ============================== */

export type TipoRegra = { k: string; nome: string; obrigatoria: boolean };
export type ItemPreco = {
    tipo: 'titular' | 'extra';
    idade_ini: number | null;
    idade_fim: number | null;
    valor_adesao: number;
    valor_mensal: number;
    percentual_mensal: number | null;
    qtd_sem_custo: number;
    qtd_max: number | null;
};
export type Tabela = { id: number; nome: string; vale_desde: string; vale_ate: string | null; estado: 'vigente' | 'futura' | 'encerrada'; itens: ItemPreco[] };
export type Plano = {
    id: number;
    nome: string;
    descricao: string | null;
    situacao: 'vende' | 'fora_venda' | 'inativo';
    ordem: number;
    tipo_preco: 'simples' | 'faixas' | 'contrato';
    area_negocio: string | null;
    urna: string | null;
    translado_km: number | null;
    translado_texto: string | null;
    tanatopraxia: string | null;
    telemedicina: string | null;
    vigencia_meses: number | null;
    renovacao_automatica: boolean;
    aceita_aditivo: boolean;
    aceita_troca_titular: boolean;
    vagas: Record<string, number>;
    faltam: string[];
    em_configuracao: string[];
    tem_preco: boolean;
    tabelas: Tabela[];
    aditivos: { aditivo_id: number; condicao: string | null }[];
    documentos: { id: number; tipo: string; nome: string; vale_desde: string | null; arquivo_url: string | null }[];
    coberturas_unymos: number;
};
export type Versao = { versao: number; vale_desde: string; motivo: string | null; criado_em: string; usuario: string | null; parametros: Record<string, any> };
export type Regra = { id: number; tipo: string; nome: string; situacao: 'configuracao' | 'aprovada' | 'inativa'; versao_atual: number | null; versoes: Versao[]; usada_em: number[] };
export type Aditivo = { id: number; nome: string; descricao: string | null; situacao: string };
export type Dados = { hoje: string; tipos: TipoRegra[]; planos: Plano[]; regras: Regra[]; aditivos: Aditivo[]; pode_planos: boolean; pode_regras: boolean };

/* ============================== dados ============================== */

export function useDados() {
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');
    const recarregar = useCallback(async () => {
        try {
            const j = await api(URL_PL, 'dados');
            setDados(j.dados);
            setErro('');
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar os planos.');
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void recarregar();
    }, [recarregar]);
    return { dados, erro, recarregar };
}

export type Gravar = (acao: string, corpo: Record<string, unknown>) => Promise<any | null>;

/** Grava no pl_planos.php, avisa e recarrega. Devolve a resposta, ou null se deu erro (o aviso mostra a mensagem). */
export function useGravar(avisar: (m: string) => void, recarregar: () => Promise<unknown>): Gravar {
    return useCallback(
        async (acao, corpo) => {
            try {
                const j = await api(URL_PL, acao, corpo);
                avisar(j.msg);
                await recarregar();
                return j;
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível salvar.');
                if (m) avisar(m);
                return null;
            }
        },
        [avisar, recarregar],
    );
}

/* ============================== textos e selos ============================== */

export const SIT_PLANO: Record<Plano['situacao'], string> = { vende: 'À venda', fora_venda: 'Fora de venda (só contratos existentes)', inativo: 'Inativo' };
export const TIPO_PRECO: Record<Plano['tipo_preco'], string> = {
    simples: 'Valor único',
    faixas: 'Faixas de idade (pessoa mais velha)',
    contrato: 'Cada contrato guarda o próprio valor',
};
export const SIT_REGRA: Record<Regra['situacao'], string> = { configuracao: 'Em configuração', aprovada: 'Aprovada', inativa: 'Inativa' };

export function SeloPlano({ p }: { p: Plano }) {
    if (p.situacao === 'inativo') return <span className={`${SELO} ${S_MUDO}`}>Inativo</span>;
    if (p.situacao === 'fora_venda') return <span className={`${SELO} ${S_MUDO}`}>Só contratos existentes</span>;
    if (p.faltam.length) return <span className={`${SELO} ${S_RUIM}`}>Falta {p.faltam.length} regra(s)</span>;
    if (!p.tem_preco) return <span className={`${SELO} ${S_RUIM}`}>Sem preço vigente</span>;
    if (p.em_configuracao.length) return <span className={`${SELO} ${S_AVISO}`}>Regra em configuração</span>;
    return <span className={`${SELO} ${S_OK}`}>Pronto para vender</span>;
}

export function SeloRegra({ s }: { s: Regra['situacao'] }) {
    return <span className={`${SELO} ${s === 'aprovada' ? S_OK : s === 'configuracao' ? S_AVISO : S_MUDO}`}>{SIT_REGRA[s]}</span>;
}

export function SeloTipo({ nome }: { nome: string }) {
    return <span className={`${SELO} ${S_AB}`}>{nome}</span>;
}

export const versaoAtual = (r: Regra): Versao | null => r.versoes.find((v) => v.versao === r.versao_atual) ?? r.versoes[0] ?? null;

/* ============================== campos de cada tipo de regra ============================== */

type Op = [string, string];
export type CampoRegra =
    | { k: string; r: string; t: 'num'; un?: string }
    | { k: string; r: string; t: 'sim' }
    | { k: string; r: string; t: 'escolha'; ops: Op[] }
    | { k: string; r: string; t: 'varios'; ops: Op[] }
    | { k: string; r: string; t: 'faixas_desconto' };

const PARENTESCOS: Op[] = [
    ['conjuge', 'Cônjuge'],
    ['filho_solteiro', 'Filhos solteiros'],
    ['pai_mae', 'Pais'],
    ['sogro_sogra', 'Sogros'],
    ['vinculo_familiar', 'Qualquer parentesco com vínculo familiar'],
];

export const CAMPOS_TIPO: Record<string, CampoRegra[]> = {
    carencia: [
        { k: 'conta_de', r: 'Conta a partir de', t: 'escolha', ops: [['pagamento_adesao', 'Pagamento da adesão'], ['cadastro_contrato', 'Cadastro do contrato']] },
        { k: 'natural_dias', r: 'Morte natural', t: 'num', un: 'dias' },
        { k: 'externa_horas', r: 'Causa externa, acidental ou violenta', t: 'num', un: 'horas' },
        { k: 'dependente_dias', r: 'Dependente incluído depois', t: 'num', un: 'dias' },
        { k: 'flex_dependente_conta_de', r: 'No FLEX, a carência do dependente conta de', t: 'escolha', ops: [['primeira_mensalidade_apos_inclusao', '1ª mensalidade após a inclusão'], ['inclusao', 'Data da inclusão']] },
        { k: 'desconto_uso_na_carencia', r: 'Uso dentro da carência (desconto sobre o atendimento)', t: 'faixas_desconto' },
        { k: 'volta_inadimplencia_dias', r: 'Volta da inadimplência: nova carência', t: 'num', un: 'dias' },
    ],
    cobranca: [
        { k: 'parcelas_por_ciclo', r: 'Parcelas geradas por ciclo', t: 'num', un: 'parcelas' },
        { k: 'permite_antecipar', r: 'Cliente pode antecipar parcelas', t: 'sim' },
        { k: 'primeira_mensalidade', r: '1ª mensalidade', t: 'escolha', ops: [['mes_seguinte', 'Mês seguinte ao contrato'], ['mesmo_mes', 'No mês do contrato']] },
        { k: 'adiar_primeira_ate_dias', r: 'Vendedor pode adiar a 1ª mensalidade até', t: 'num', un: 'dias' },
        { k: 'adesao', r: 'Adesão', t: 'escolha', ops: [['a_vista', 'À vista'], ['junto_primeira', 'Junto com a 1ª mensalidade']] },
        { k: 'arredondamento', r: 'Arredondamento', t: 'escolha', ops: [['centavo_acima', 'Para cima, em centavos inteiros'], ['normal', 'Normal']] },
        { k: 'multa_perc', r: 'Multa por atraso', t: 'num', un: '%' },
        { k: 'juros_mes_perc', r: 'Juros por mês', t: 'num', un: '%' },
        { k: 'boleto', r: 'Boleto', t: 'escolha', ops: [['sob_demanda', 'Registrado só para a parcela que o cliente escolher'], ['todas', 'Registrado para todas as parcelas']] },
        { k: 'recalcula_idade', r: 'Idade dos beneficiários (faixa)', t: 'escolha', ops: [['cada_ciclo', 'Recalculada a cada ciclo'], ['nunca', 'Não recalcula']] },
        { k: 'faixa_inclusao_mais_velho', r: 'Entra alguém mais velho (muda a faixa)', t: 'escolha', ops: [['proxima_parcela_aberta', 'Muda já na próxima parcela em aberto'], ['proximo_ciclo', 'Muda só no ciclo seguinte']] },
        { k: 'faixa_saida_mais_velho', r: 'Sai a pessoa mais velha (exclusão ou falecimento)', t: 'escolha', ops: [['proximo_ciclo', 'Baixa só no ciclo seguinte'], ['proxima_parcela_aberta', 'Baixa já na próxima parcela em aberto']] },
    ],
    situacao: [
        { k: 'ativo_ate_dias_atraso', r: 'Ativo com atraso de até', t: 'num', un: 'dias' },
        { k: 'suspenso_apos_dias', r: 'Suspenso com parcela vencida há mais de', t: 'num', un: 'dias' },
        { k: 'juridico_apos_dias', r: 'Cobrança jurídica com atraso de mais de', t: 'num', un: 'dias' },
        { k: 'honorarios_perc', r: 'Honorários da cobrança jurídica', t: 'num', un: '%' },
        { k: 'rescisao_mensalidades', r: 'Rescisão por inadimplência com mais de', t: 'num', un: 'mensalidades' },
        { k: 'rescisao_exige_notificacao', r: 'Rescisão exige notificação', t: 'sim' },
        { k: 'com_atendimento_dias_apos_notificacao', r: 'Com atendimento no período: prazo após a notificação', t: 'num', un: 'dias' },
        { k: 'volta_ativo_carencia_dias', r: 'Ao quitar, volta ao Ativo com nova carência de', t: 'num', un: 'dias' },
    ],
    cancelamento: [
        { k: 'rescisao_aviso_dias', r: 'Rescisão a pedido: aviso prévio', t: 'num', un: 'dias' },
        { k: 'rescisao_exige_em_dia', r: 'Rescisão a pedido exige mensalidades em dia', t: 'sim' },
        { k: 'devolve', r: 'Devolve valores pagos', t: 'sim' },
        {
            k: 'ressarcimento',
            r: 'Ressarcimento após uso',
            t: 'escolha',
            ops: [['menor_entre_tabela_particular_menos_pago_e_mensalidades_ate_fim_periodo', 'O menor entre: atendimento pela tabela particular menos o que foi pago; mensalidades não pagas e vincendas até o fim do período']],
        },
        { k: 'periodo', r: 'Período do ressarcimento', t: 'escolha', ops: [['maior_entre_fim_vigencia_e_24_meses', 'Fim da vigência em curso no uso ou 24 meses depois dele, o que for maior']] },
        { k: 'nao_aplica', r: 'Não se aplica', t: 'escolha', ops: [['morte_titular_sem_sucessor', 'Morte do titular sem sucessor']] },
    ],
    reajuste: [
        { k: 'indice', r: 'Índice', t: 'escolha', ops: [['IPCA_12_meses', 'IPCA dos 12 meses'], ['INPC_12_meses', 'INPC dos 12 meses'], ['IGPM_12_meses', 'IGP-M dos 12 meses']] },
        { k: 'quando', r: 'Quando', t: 'escolha', ops: [['aniversario_contrato', 'No aniversário de cada contrato'], ['mes_fixo', 'Num mês fixo para todos']] },
        { k: 'altera_parcelas_geradas', r: 'Muda parcelas já geradas', t: 'sim' },
        { k: 'novos_pela_tabela_vigente', r: 'Contratos novos entram pela tabela de preço vigente', t: 'sim' },
    ],
    beneficiarios: [
        { k: 'parentescos', r: 'Quem pode entrar', t: 'varios', ops: PARENTESCOS },
        { k: 'max_alem_titular', r: 'Máximo de pessoas além do titular', t: 'num', un: 'pessoas' },
        { k: 'extras_sem_custo', r: 'Extras sem custo', t: 'num', un: 'pessoas' },
        { k: 'extras_max', r: 'Máximo de extras pagos', t: 'num', un: 'pessoas' },
        { k: 'extra_perc', r: 'Cada extra pago', t: 'num', un: '% da mensalidade' },
        { k: 'pet', r: 'Aceita pet (urna pet)', t: 'sim' },
        { k: 'mensalidade_pela', r: 'Mensalidade pela idade de', t: 'escolha', ops: [['pessoa_mais_velha', 'Pessoa mais velha do contrato'], ['titular', 'Titular']] },
        { k: 'nascimento_obrigatorio', r: 'Data de nascimento obrigatória', t: 'sim' },
        { k: 'bloqueia_inclusao_vencidas', r: 'Bloqueia inclusão com', t: 'num', un: 'parcelas vencidas ou mais' },
    ],
    negociacao: [
        { k: 'a_partir_vencidas', r: 'Vale com', t: 'num', un: 'parcelas vencidas ou mais' },
        { k: 'carencia_dias', r: 'Nova carência', t: 'num', un: 'dias' },
        { k: 'desconto_vencidas', r: 'Desconto nas vencidas', t: 'sim' },
        { k: 'isenta_multa_juros', r: 'Isenta multa e juros', t: 'sim' },
        { k: 'forma', r: 'Condições', t: 'escolha', ops: [['a_vista_ou_entrada_mais_1_a_12', 'À vista ou entrada + 1 a 12 parcelas'], ['a_vista', 'Só à vista']] },
        { k: 'so_mensalidades', r: 'Só mensalidades', t: 'sim' },
    ],
};

const vazio = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const comoLista = (v: any): string[] => (Array.isArray(v) ? v.map(String) : vazio(v) ? [] : [String(v)]);

/** Texto de um valor de parâmetro para leitura. */
export function textoParametro(c: CampoRegra | undefined, v: any): string {
    if (vazio(v)) return '—';
    if (!c) return typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (c.t === 'sim') return v ? 'Sim' : 'Não';
    if (c.t === 'num') return `${Number(v).toLocaleString('pt-BR')}${c.un ? ` ${c.un}` : ''}`;
    if (c.t === 'escolha') return c.ops.find(([k]) => k === v)?.[1] ?? String(v);
    if (c.t === 'varios') return comoLista(v).map((x) => c.ops.find(([k]) => k === x)?.[1] ?? x).join(', ');
    if (c.t === 'faixas_desconto')
        return (Array.isArray(v) ? v : []).map((f: any) => `${f.perc}% faltando ${f.de} a ${f.ate} dias`).join(' · ') || '—';
    return String(v);
}

/** Antes de gravar: número digitado pela metade ("1.") vira número. */
export function limparParametros(tipo: string, par: Record<string, any>): Record<string, any> {
    const n: Record<string, any> = { ...par };
    for (const c of CAMPOS_TIPO[tipo] ?? []) {
        if (c.t === 'num' && typeof n[c.k] === 'string') {
            const x = Number(n[c.k]);
            if (Number.isFinite(x)) n[c.k] = x;
            else delete n[c.k];
        }
    }
    return n;
}

/** Lista "rótulo: valor" dos parâmetros (campos do tipo primeiro; chaves desconhecidas no fim, só leitura). */
export function VerParametros({ tipo, par }: { tipo: string; par: Record<string, any> }) {
    const campos = CAMPOS_TIPO[tipo] ?? [];
    const conhecidas = new Set(campos.map((c) => c.k));
    const linhas: [string, string][] = [
        ...campos.filter((c) => !vazio(par?.[c.k])).map((c) => [c.r, textoParametro(c, par[c.k])] as [string, string]),
        ...Object.keys(par || {})
            .filter((k) => !conhecidas.has(k) && !vazio(par[k]))
            .map((k) => [k, textoParametro(undefined, par[k])] as [string, string]),
    ];
    if (!linhas.length) return <div className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nenhum campo preenchido ainda.</div>;
    return (
        <div className="grid gap-2.5 sm:grid-cols-2">
            {linhas.map(([r, v]) => (
                <div key={r} className="rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 dark:bg-[#1C2334]">
                    <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{r}</div>
                    <div className="mt-0.5 break-words text-[14.5px] font-bold">{v}</div>
                </div>
            ))}
        </div>
    );
}

/** Formulário dos parâmetros de um tipo de regra. */
export function EditarParametros({ tipo, par, setPar }: { tipo: string; par: Record<string, any>; setPar: (p: Record<string, any>) => void }) {
    const campos = CAMPOS_TIPO[tipo] ?? [];
    const set = (k: string, v: any) => {
        const n = { ...par };
        if (vazio(v)) delete n[k];
        else n[k] = v;
        setPar(n);
    };
    return (
        <div className="grid gap-3.5 sm:grid-cols-2">
            {campos.map((c) => (
                <div key={c.k} className={c.t === 'varios' || c.t === 'faixas_desconto' ? 'sm:col-span-2' : ''}>
                    <label className={ROTULO}>
                        {c.r}
                        {c.t === 'num' && c.un ? ` (${c.un})` : ''}
                    </label>
                    {c.t === 'num' ? (
                        <input
                            className={CAMPO_P}
                            inputMode="decimal"
                            value={par[c.k] ?? ''}
                            onChange={(e) => {
                                const s = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                                set(c.k, s === '' ? null : s.endsWith('.') ? s : Number(s));
                            }}
                        />
                    ) : null}
                    {c.t === 'sim' ? (
                        <select className={CAMPO_P} value={par[c.k] === undefined ? '' : par[c.k] ? '1' : '0'} onChange={(e) => set(c.k, e.target.value === '' ? null : e.target.value === '1')}>
                            <option value="">—</option>
                            <option value="1">Sim</option>
                            <option value="0">Não</option>
                        </select>
                    ) : null}
                    {c.t === 'escolha' ? (
                        <select className={CAMPO_P} value={par[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value || null)}>
                            <option value="">—</option>
                            {c.ops.map(([k, r]) => (
                                <option key={k} value={k}>
                                    {r}
                                </option>
                            ))}
                            {par[c.k] && !c.ops.some(([k]) => k === par[c.k]) ? <option value={par[c.k]}>{String(par[c.k])}</option> : null}
                        </select>
                    ) : null}
                    {c.t === 'varios' ? (
                        <div className="flex flex-wrap gap-2">
                            {c.ops.map(([k, r]) => {
                                const lista = comoLista(par[c.k]);
                                const on = lista.includes(k);
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => set(c.k, on ? lista.filter((x) => x !== k) : [...lista, k])}
                                        className={`min-h-11 rounded-xl px-3.5 text-left text-[14px] font-bold ${on ? 'bg-[#313C55] text-white dark:bg-[#3D6A99]' : 'bg-[#F1F4F8] dark:bg-[#1C2334]'}`}
                                    >
                                        {r}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                    {c.t === 'faixas_desconto' ? <FaixasDesconto v={Array.isArray(par[c.k]) ? par[c.k] : []} set={(v) => set(c.k, v)} /> : null}
                </div>
            ))}
        </div>
    );
}

function FaixasDesconto({ v, set }: { v: { de: number; ate: number; perc: number }[]; set: (v: { de: number; ate: number; perc: number }[]) => void }) {
    const muda = (i: number, k: 'de' | 'ate' | 'perc', s: string) => set(v.map((f, j) => (j === i ? { ...f, [k]: Number(s.replace(/\D/g, '')) || 0 } : f)));
    return (
        <div className="flex flex-col gap-2">
            {v.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span>Faltando</span>
                    <input className={`${CAMPO_P} !w-20`} inputMode="numeric" value={f.de} onChange={(e) => muda(i, 'de', e.target.value)} aria-label="De (dias)" />
                    <span>a</span>
                    <input className={`${CAMPO_P} !w-20`} inputMode="numeric" value={f.ate} onChange={(e) => muda(i, 'ate', e.target.value)} aria-label="Até (dias)" />
                    <span>dias:</span>
                    <input className={`${CAMPO_P} !w-20`} inputMode="numeric" value={f.perc} onChange={(e) => muda(i, 'perc', e.target.value)} aria-label="Desconto (%)" />
                    <span>%</span>
                    <button type="button" className="min-h-11 px-2 text-[13.5px] font-extrabold text-[#B42318] dark:text-[#FF9C92]" onClick={() => set(v.filter((_, j) => j !== i))}>
                        Tirar
                    </button>
                </div>
            ))}
            <button type="button" className="min-h-11 self-start rounded-xl bg-[#F1F4F8] px-3.5 text-[14px] font-extrabold dark:bg-[#1C2334]" onClick={() => set([...v, { de: 0, ate: 0, perc: 0 }])}>
                + Faixa de desconto
            </button>
        </div>
    );
}
