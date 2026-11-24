'use client';

/**
 * Entrada do estoque com nota e pagamento (24/11/2026, prévia "Como Foi Pago" aprovada — versão 5).
 * Uma tela só, como a rotina 220 da Unymos:
 *  - Lançar (Estoque › Movimentações › Entrada): fornecedor e número da nota obrigatórios; o estoque soma na hora e a
 *    entrada fica PENDENTE. O pagamento pode ficar preenchido (rascunho guardado em fin_entrada.pagamento).
 *  - Aprovar (Contas a Pagar ou Gestão): "Houve antecipação?" Sim → liga lançamentos do fornecedor que já existem
 *    (contas a pagar ou compras no cartão); o que faltar vai para a negociação. Não → negociação: tem entrada?, valor,
 *    quantidade de parcelas, intervalo e 1º vencimento geram a lista (editável). Sábado e domingo vão para a segunda.
 *  - Desaprovar (Contas a Pagar ou Gestão), com motivo, se nenhuma conta dela foi paga.
 * Todas as listas são digitáveis com busca (Combo). Back-end: fin_entrada.php.
 * Usado em: Estoque › Movimentações (NotaEstoque e lista Entradas) e Contas a Pagar (quadro das entradas a aprovar).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Combo, type Opcao } from '../../contratos/components/ct';
import { api, brl, BTN_PEQ, BTN_PRI, BTN_SEC, CAMPO, CAMPO_P, dataBR, diaMais, hojeISO, Janela, mensagemErro, numCampo, paraNumero, ROTULO, SELO, S_AVISO, S_MUDO, S_OK, SUB } from './fin';

export const URL_ENT = 'https://api.planoassistencialintegrado.com.br/fin_entrada.php';

/* ============================== tipos e regras ============================== */

export type BaseEnt = {
    fornecedores: { id: number; nome: string; documento: string | null; fornecedor: boolean; natureza_padrao_id: number | null }[];
    naturezas: { id: number; codigo: string; nome: string }[];
    areas: { id: number; nome: string }[];
    locais: { id: number; nome: string }[];
    formas: { id: number; nome: string }[];
    pode_aprovar: boolean;
};

export type NotaEnt = { pessoa_id: number | null; documento: string; serie: string; emissao: string; natureza_id: number | null; area_id: number | null; local_id: number | null };
export const notaVazia = (): NotaEnt => ({ pessoa_id: null, documento: '', serie: '', emissao: hojeISO(), natureza_id: null, area_id: null, local_id: null });

export type ParcelaEnt = { venc: string; era: string | null; valor: string; forma_id: number | null; linha: string; entrada: boolean };
export type Ligado = { tipo: 'titulo' | 'compra'; id: number; descricao: string; valor: number; info: string };
export type PagEnt = {
    ant: 'sim' | 'nao' | null; // houve antecipação?
    formaAnt: number | null; // forma da antecipação (-1 = cartão de crédito)
    ligados: Ligado[];
    tem: boolean; // negociação com entrada?
    vEnt: string;
    dEnt: string;
    fEnt: number | null;
    qtd: string;
    intervalo: string; // número = dias; mN = N meses no mesmo dia; livre = datas digitadas
    p1: string;
    fParc: number | null;
    parcelas: ParcelaEnt[];
};
export const pagVazio = (): PagEnt => ({ ant: null, formaAnt: null, ligados: [], tem: false, vEnt: '', dEnt: hojeISO(), fEnt: null, qtd: '1', intervalo: '30', p1: diaMais(hojeISO(), 30), fParc: null, parcelas: [] });

const CARTAO = -1;
const cent = (v: number) => Math.round(v * 100) / 100;
const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dow = (iso: string) => new Date(`${iso}T12:00:00`).getDay();
/** Sábado e domingo vão para a segunda-feira (próximo dia útil). Igual ao fin_entrada.php. */
export const diaUtil = (iso: string) => (dow(iso) === 6 ? diaMais(iso, 2) : dow(iso) === 0 ? diaMais(iso, 1) : iso);
const mesMaisDia = (iso: string, n: number) => {
    const [a, m, d] = iso.split('-').map(Number);
    const ult = new Date(a, m - 1 + n + 1, 0).getDate();
    const x = new Date(a, m - 1 + n, Math.min(d, ult));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const INTERVALOS: [string, string][] = [
    ['30', 'A cada 30 dias'],
    ['m1', 'Mensal (todo mês, no mesmo dia)'],
    ['7', 'Semanal (a cada 7 dias)'],
    ['10', 'A cada 10 dias'],
    ['14', 'A cada 14 dias'],
    ['15', 'Quinzenal (a cada 15 dias)'],
    ['20', 'A cada 20 dias'],
    ['21', 'A cada 21 dias'],
    ['28', 'A cada 28 dias'],
    ['35', 'A cada 35 dias'],
    ['45', 'A cada 45 dias'],
    ['60', 'A cada 60 dias'],
    ['90', 'A cada 90 dias'],
    ['m2', 'Bimestral (a cada 2 meses, mesmo dia)'],
    ['m3', 'Trimestral (a cada 3 meses, mesmo dia)'],
    ['m6', 'Semestral (a cada 6 meses, mesmo dia)'],
    ['m12', 'Anual (a cada 12 meses, mesmo dia)'],
    ['livre', 'Datas livres (digito cada vencimento)'],
];
const rotuloIntervalo = (c: string) => INTERVALOS.find((i) => i[0] === c)?.[1] ?? (/^m\d+$/.test(c) ? `A cada ${c.slice(1)} meses, mesmo dia` : `A cada ${c} dias`);
const meses = (c: string) => (/^m\d+$/.test(c) ? Number(c.slice(1)) : 0);
const p1Padrao = (c: string) => (meses(c) ? mesMaisDia(hojeISO(), meses(c)) : diaMais(hojeISO(), c === 'livre' ? 30 : Number(c) || 30));

export const somaLigados = (p: PagEnt) => (p.ant === 'sim' ? cent(p.ligados.reduce((a, x) => a + x.valor, 0)) : 0);
export const somaParcelas = (p: PagEnt) => cent(p.parcelas.reduce((a, x) => a + (paraNumero(x.valor) || 0), 0));

/** Monta a lista de parcelas: entrada (se houver) + N parcelas iguais (a última fecha os centavos). */
function montar(p: PagEnt, falta: number): ParcelaEnt[] {
    if (falta <= 0) return [];
    const n = Math.max(1, Math.min(60, Number(p.qtd) || 1));
    const out: ParcelaEnt[] = [];
    let resto = cent(falta);
    if (p.tem) {
        const v = Math.min(cent(paraNumero(p.vEnt) || 0), resto);
        const d = p.dEnt || hojeISO();
        out.push({ venc: diaUtil(d), era: diaUtil(d) !== d ? d : null, valor: numCampo(v), forma_id: p.fEnt, linha: '', entrada: true });
        resto = cent(resto - v);
    }
    const base = Math.floor((resto / n) * 100) / 100;
    const m = meses(p.intervalo);
    const passo = p.intervalo === 'livre' ? 30 : Number(p.intervalo) || 30;
    for (let i = 0; i < n; i++) {
        const d = m ? mesMaisDia(p.p1, m * i) : diaMais(p.p1, passo * i);
        out.push({ venc: diaUtil(d), era: diaUtil(d) !== d ? d : null, valor: numCampo(i === n - 1 ? cent(resto - base * (n - 1)) : base), forma_id: p.fParc, linha: '', entrada: false });
    }
    return out;
}

/** O que falta na nota para salvar a entrada (fornecedor e número da nota). */
export function notaProblemas(n: NotaEnt): string[] {
    const f: string[] = [];
    if (!n.pessoa_id) f.push('fornecedor');
    if (!n.documento.trim()) f.push('número da nota');
    return f;
}

/** O que falta para aprovar (vazio = pode aprovar). */
export function aprovarProblemas(n: NotaEnt, p: PagEnt, total: number): string[] {
    const f = notaProblemas(n);
    if (!n.natureza_id) f.push('natureza');
    if (!n.area_id) f.push('área');
    if (!p.ant) f.push('responder se houve antecipação');
    if (p.ant === 'sim' && !p.ligados.length) f.push('ligar o lançamento da antecipação');
    if (p.parcelas.some((x) => !x.venc || !(paraNumero(x.valor) || 0) || !x.forma_id)) f.push('vencimento, valor e forma de todas as parcelas');
    const dif = cent(total - somaLigados(p) - somaParcelas(p));
    if (p.ant && Math.abs(dif) > 0.009) f.push(dif > 0 ? `${brl(dif)} que faltam na negociação` : `tirar ${brl(-dif)} que passaram do total`);
    return f;
}

const notaParaEnvio = (lancamento: string, n: NotaEnt, p: PagEnt, comPagamento: boolean) => ({
    lancamento,
    pessoa_id: n.pessoa_id,
    documento: n.documento.trim() || null,
    serie: n.serie.trim() || null,
    emissao: n.emissao || null,
    natureza_id: n.natureza_id,
    area_id: n.area_id,
    local_id: n.local_id,
    pagamento: comPagamento
        ? {
              ...p,
              antecipacao: p.ant === 'sim',
              parcelas: p.parcelas.map((x) => ({ ...x, vencimento: x.venc, valor: paraNumero(x.valor), linha_digitavel: x.linha.replace(/\D/g, '') || null })),
          }
        : null,
});

/** Guarda a nota (e o pagamento preenchido até aqui) como pendente. */
export function salvarNota(lancamento: string, n: NotaEnt, p: PagEnt) {
    return api(URL_ENT, 'salvar', notaParaEnvio(lancamento, n, p, true));
}

/** Volta o rascunho guardado no servidor para o estado da tela. */
function pagDoServidor(x: any): PagEnt {
    const v = pagVazio();
    if (!x || typeof x !== 'object') return v;
    return {
        ...v,
        ...Object.fromEntries(Object.entries(x).filter(([k]) => k in v)),
        ligados: Array.isArray(x.ligados) ? x.ligados.filter((l: any) => l && typeof l.valor === 'number' && (l.tipo === 'titulo' || l.tipo === 'compra')) : [],
        parcelas: Array.isArray(x.parcelas) ? x.parcelas.map((y: any) => ({ venc: y.venc || y.vencimento || '', era: y.era ?? null, valor: typeof y.valor === 'number' ? numCampo(y.valor) : String(y.valor ?? ''), forma_id: y.forma_id ?? null, linha: y.linha || '', entrada: !!y.entrada })) : [],
    } as PagEnt;
}

/* ============================== cadastros (para quem não tem o financeiro) ============================== */

export function useBaseEnt() {
    const [base, setBase] = useState<BaseEnt | null>(null);
    const [erro, setErro] = useState('');
    const recarregar = useCallback(async () => {
        try {
            const j = await api(URL_ENT, 'base');
            setBase(j.dados);
            setErro('');
        } catch (e: any) {
            setErro(mensagemErro(e, 'Não foi possível carregar os fornecedores.') || '');
        }
    }, []);
    useEffect(() => {
        void recarregar();
    }, [recarregar]);
    return { base, erro, recarregar };
}

/* ============================== nota: fornecedor, número, natureza... ============================== */

export function NotaCampos({ base, nota, setNota, recarregarBase, avisar, desativado }: { base: BaseEnt; nota: NotaEnt; setNota: (f: (n: NotaEnt) => NotaEnt) => void; recarregarBase: () => Promise<unknown>; avisar: (m: string) => void; desativado?: boolean }) {
    const [novoForn, setNovoForn] = useState<string | null>(null);
    const set = (p: Partial<NotaEnt>) => setNota((n) => ({ ...n, ...p }));
    const fornecedores = useMemo<Opcao<number>[]>(() => base.fornecedores.map((p) => ({ v: p.id, t: p.nome, s: p.documento || undefined })), [base.fornecedores]);
    const naturezas = useMemo<Opcao<number>[]>(() => base.naturezas.map((x) => ({ v: x.id, t: `${x.codigo} ${x.nome}` })), [base.naturezas]);
    const areas = useMemo<Opcao<number>[]>(() => base.areas.map((x) => ({ v: x.id, t: x.nome })), [base.areas]);
    const locais = useMemo<Opcao<number>[]>(() => base.locais.map((x) => ({ v: x.id, t: x.nome })), [base.locais]);
    const ultimoPedido = useRef(0);
    // fornecedor escolhido: natureza do cadastro dele ou a da última conta dele, se ainda estiverem vazias
    const escolherFornecedor = async (id: number | null) => {
        set({ pessoa_id: id });
        if (!id) return;
        const pad = base.fornecedores.find((p) => p.id === id)?.natureza_padrao_id ?? null;
        const meu = ++ultimoPedido.current;
        try {
            const j = await api(URL_ENT, 'ultima', undefined, `&pessoa_id=${id}`);
            if (meu !== ultimoPedido.current) return;
            const u = j.dados as { natureza_id: number; area_id: number | null; local_id: number | null } | null;
            setNota((n) => ({ ...n, natureza_id: n.natureza_id ?? pad ?? u?.natureza_id ?? null, area_id: n.area_id ?? u?.area_id ?? null, local_id: n.local_id ?? u?.local_id ?? null }));
        } catch {
            if (pad) setNota((n) => ({ ...n, natureza_id: n.natureza_id ?? pad }));
        }
    };
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
                <span className={ROTULO}>Fornecedor</span>
                <Combo rotulo="Fornecedor" classe={CAMPO} opcoes={fornecedores} valor={nota.pessoa_id} onChange={(v) => void escolherFornecedor(v)} placeholder="Digite parte do nome ou do CNPJ" novo="+ Cadastrar fornecedor" onNovo={(t) => setNovoForn(t)} desativado={desativado} />
            </div>
            <label>
                <span className={ROTULO}>Nº da nota</span>
                <input className={CAMPO} value={nota.documento} onChange={(e) => set({ documento: e.target.value })} inputMode="numeric" disabled={desativado} />
            </label>
            <div className="grid grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] gap-3">
                <label>
                    <span className={ROTULO}>Série</span>
                    <input className={CAMPO} value={nota.serie} onChange={(e) => set({ serie: e.target.value })} disabled={desativado} />
                </label>
                <label>
                    <span className={ROTULO}>Emissão</span>
                    <input type="date" className={CAMPO} value={nota.emissao} max={hojeISO()} onChange={(e) => set({ emissao: e.target.value })} disabled={desativado} />
                </label>
            </div>
            <div>
                <span className={ROTULO}>Natureza</span>
                <Combo rotulo="Natureza" classe={CAMPO} opcoes={naturezas} valor={nota.natureza_id} onChange={(v) => set({ natureza_id: v })} placeholder="Digite o código ou o nome" desativado={desativado} />
            </div>
            <div>
                <span className={ROTULO}>Área</span>
                <Combo rotulo="Área" classe={CAMPO} opcoes={areas} valor={nota.area_id} onChange={(v) => set({ area_id: v })} desativado={desativado} />
            </div>
            <div>
                <span className={ROTULO}>Local (opcional)</span>
                <Combo rotulo="Local" classe={CAMPO} opcoes={locais} valor={nota.local_id} onChange={(v) => set({ local_id: v })} vazio="Sem local" desativado={desativado} />
            </div>
            {novoForn !== null ? (
                <JanelaFornecedor
                    base={base}
                    nomeInicial={novoForn}
                    onFechar={() => setNovoForn(null)}
                    onSalvo={async (id) => {
                        await recarregarBase();
                        setNovoForn(null);
                        void escolherFornecedor(id);
                        avisar('Fornecedor cadastrado.');
                    }}
                />
            ) : null}
        </div>
    );
}

/** Cadastro de fornecedor (cadastro único de clientes e fornecedores, pelo fin_entrada.php). */
export function JanelaFornecedor({ base, nomeInicial, onFechar, onSalvo }: { base: BaseEnt; nomeInicial: string; onFechar: () => void; onSalvo: (id: number) => Promise<void> | void }) {
    const [f, setF] = useState({ nome: nomeInicial, documento: '', telefone: '', email: '', natureza_padrao_id: null as number | null, pix_tipo: '', pix_chave: '' });
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const doc = f.documento.replace(/\D/g, '');
    const docOk = doc === '' || doc.length === 11 || doc.length === 14;
    const naturezas = useMemo<Opcao<number>[]>(() => base.naturezas.map((x) => ({ v: x.id, t: `${x.codigo} ${x.nome}` })), [base.naturezas]);
    const salvar = async () => {
        setSalvando(true);
        setErro('');
        try {
            const j = await api(URL_ENT, 'fornecedor', {
                nome: f.nome.trim(),
                documento: doc || null,
                telefone: f.telefone.trim() || null,
                email: f.email.trim() || null,
                natureza_padrao_id: f.natureza_padrao_id,
                pix_tipo: f.pix_tipo || null,
                pix_chave: f.pix_chave.trim() || null,
            });
            await onSalvo(Number(j.dados?.id));
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível cadastrar o fornecedor.');
            if (m) setErro(m);
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo="Cadastrar fornecedor"
            sub="Entra no cadastro único de clientes e fornecedores do financeiro."
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!f.nome.trim() || !docOk || salvando} onClick={() => void salvar()}>
                        {salvando ? 'Salvando…' : 'Cadastrar'}
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Nome ou razão social</span>
                <input className={CAMPO} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label>
                    <span className={ROTULO}>CNPJ ou CPF</span>
                    <input className={CAMPO} inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
                    {!docOk ? <span className="mt-1 block text-[12.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">CNPJ tem 14 números e CPF 11.</span> : null}
                </label>
                <label>
                    <span className={ROTULO}>Telefone</span>
                    <input className={CAMPO} inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
                </label>
                <label>
                    <span className={ROTULO}>E-mail</span>
                    <input className={CAMPO} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                </label>
                <div>
                    <span className={ROTULO}>Natureza padrão</span>
                    <Combo rotulo="Natureza padrão" classe={CAMPO} opcoes={naturezas} valor={f.natureza_padrao_id} onChange={(v) => setF({ ...f, natureza_padrao_id: v })} vazio="Sem natureza padrão" />
                </div>
                <div>
                    <span className={ROTULO}>Tipo da chave Pix</span>
                    <Combo
                        rotulo="Tipo da chave Pix"
                        classe={CAMPO}
                        opcoes={['CNPJ', 'CPF', 'Telefone', 'E-mail', 'Aleatória'].map((k) => ({ v: k, t: k }))}
                        valor={f.pix_tipo || null}
                        onChange={(v) => setF({ ...f, pix_tipo: v || '' })}
                        vazio="Sem Pix"
                    />
                </div>
                <label>
                    <span className={ROTULO}>Chave Pix</span>
                    <input className={CAMPO} value={f.pix_chave} onChange={(e) => setF({ ...f, pix_chave: e.target.value })} disabled={!f.pix_tipo} />
                </label>
            </div>
            {erro ? <p className="text-[13.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
        </Janela>
    );
}

/* ============================== pagamento: antecipação e negociação ============================== */

const SEG = 'flex h-12 gap-1 rounded-xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]';
const SEG_B = (on: boolean) => `flex-1 rounded-lg px-3 text-[14px] font-extrabold disabled:opacity-60 ${on ? 'bg-white text-[#313C55] shadow-sm dark:bg-[#232B3F] dark:text-white' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`;

function SimNao({ valor, onChange, rotulo, desativado }: { valor: boolean | null; onChange: (v: boolean) => void; rotulo: string; desativado?: boolean }) {
    return (
        <div>
            <span className={ROTULO}>{rotulo}</span>
            <div className={`${SEG} max-w-[240px]`} role="group" aria-label={rotulo}>
                <button type="button" aria-pressed={valor === false} className={SEG_B(valor === false)} onClick={() => onChange(false)} disabled={desativado}>
                    Não
                </button>
                <button type="button" aria-pressed={valor === true} className={SEG_B(valor === true)} onClick={() => onChange(true)} disabled={desativado}>
                    Sim
                </button>
            </div>
        </div>
    );
}

/**
 * Pagamento da entrada. Controlado: `pag`/`setPag`. `total` = itens + frete.
 * `podeBuscar` = tem o Contas a Pagar (a busca da antecipação é do financeiro); sem ela, a antecipação fica para quem aprova.
 * Mudar entrada, quantidade, intervalo ou 1º vencimento refaz a lista; ajustes à mão valem até a próxima mudança.
 */
export function PagamentoCampos({ base, total, pessoaId, pag, setPag, podeBuscar, desativado }: { base: BaseEnt; total: number; pessoaId: number | null; pag: PagEnt; setPag: (f: (p: PagEnt) => PagEnt) => void; podeBuscar: boolean; desativado?: boolean }) {
    const formas = useMemo<Opcao<number>[]>(() => base.formas.map((f) => ({ v: f.id, t: f.nome })), [base.formas]);
    const achaForma = useCallback((re: RegExp) => base.formas.find((f) => re.test(f.nome))?.id ?? base.formas[0]?.id ?? null, [base.formas]);
    const formasAnt = useMemo<Opcao<number>[]>(() => [...formas, { v: CARTAO, t: 'Cartão de crédito' }], [formas]);
    const ligado = somaLigados(pag);
    const falta = cent(Math.max(0, total - ligado));
    const [txtInt, setTxtInt] = useState('');
    const opcoesIntervalo = useMemo<Opcao<string>[]>(() => {
        const base_ = INTERVALOS.map(([v, t]) => ({ v, t }));
        const n = parseInt(txtInt, 10);
        if (!(n > 0 && n <= 365)) return base_;
        const extra: Opcao<string>[] = [];
        if (!base_.some((o) => o.v === String(n))) extra.push({ v: String(n), t: `A cada ${n} dias` });
        if (n <= 24 && !base_.some((o) => o.v === `m${n}`)) extra.push({ v: `m${n}`, t: `A cada ${n} meses, mesmo dia` });
        return [...base_, ...extra];
    }, [txtInt]);
    const opcoesInt = opcoesIntervalo.some((o) => o.v === pag.intervalo) ? opcoesIntervalo : [...opcoesIntervalo, { v: pag.intervalo, t: rotuloIntervalo(pag.intervalo) }];

    // formas padrão (Pix na entrada, Boleto nas parcelas) quando a lista de formas chega
    useEffect(() => {
        if (desativado || !base.formas.length) return;
        setPag((p) => (p.fEnt && p.fParc ? p : { ...p, fEnt: p.fEnt ?? achaForma(/pix/i), fParc: p.fParc ?? achaForma(/boleto/i) }));
    }, [base.formas.length, achaForma, setPag, desativado]);

    /** Muda a condição e refaz a lista de parcelas. */
    const muda = (m: Partial<PagEnt>) =>
        setPag((p) => {
            const q = { ...p, ...m };
            return { ...q, parcelas: q.ant ? montar(q, cent(Math.max(0, total - somaLigados(q)))) : [] };
        });
    // total ou antecipação mudaram: refaz a lista (se a negociação já começou)
    const chave = `${total}|${ligado}`;
    const ultimaChave = useRef(chave);
    useEffect(() => {
        if (ultimaChave.current === chave) return;
        ultimaChave.current = chave;
        if (!desativado) setPag((p) => (p.ant ? { ...p, parcelas: montar(p, cent(Math.max(0, total - somaLigados(p)))) } : p));
    }, [chave, total, setPag, desativado]);

    const mudaParcela = (i: number, m: Partial<ParcelaEnt>) => setPag((p) => ({ ...p, parcelas: p.parcelas.map((x, j) => (j === i ? { ...x, ...m } : x)) }));
    const mudaVenc = (i: number, v: string) => {
        if (!v) return mudaParcela(i, { venc: v, era: null });
        const u = diaUtil(v);
        mudaParcela(i, { venc: u, era: u !== v ? v : null });
    };

    // busca da antecipação
    const [achados, setAchados] = useState<(Ligado & { forma?: string | null })[] | null>(null);
    const [todos, setTodos] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const [erroBusca, setErroBusca] = useState('');
    useEffect(() => {
        setAchados(null);
        setErroBusca('');
        if (!podeBuscar || desativado || pag.ant !== 'sim' || !pag.formaAnt || !pessoaId) return;
        let vivo = true;
        setBuscando(true);
        api(URL_ENT, 'antecipacoes', undefined, `&pessoa_id=${pessoaId}&cartao=${pag.formaAnt === CARTAO ? 1 : 0}`)
            .then((j) => vivo && setAchados(j.dados.lancamentos || []))
            .catch((e) => vivo && setErroBusca(mensagemErro(e, 'Não foi possível buscar os lançamentos do fornecedor.') || ''))
            .finally(() => vivo && setBuscando(false));
        return () => {
            vivo = false;
        };
    }, [podeBuscar, desativado, pag.ant, pag.formaAnt, pessoaId]);
    const nomeFormaAnt = base.formas.find((f) => f.id === pag.formaAnt)?.nome || '';
    const lista = useMemo(() => {
        if (!achados) return [];
        const daForma = pag.formaAnt === CARTAO || todos ? achados : achados.filter((x) => (x.forma || '') === nomeFormaAnt);
        // os já marcados continuam na lista; os de valor igual ao da nota (ou ao que falta) vêm primeiro
        const marcados = pag.ligados.filter((l) => !daForma.some((x) => x.tipo === l.tipo && x.id === l.id));
        return [...marcados, ...daForma].sort((a, b) => Math.abs(a.valor - total) - Math.abs(b.valor - total));
    }, [achados, pag.formaAnt, pag.ligados, todos, nomeFormaAnt, total]);
    const outrasFormas = achados && pag.formaAnt !== CARTAO ? achados.length - achados.filter((x) => (x.forma || '') === nomeFormaAnt).length : 0;
    const marcar = (x: Ligado, on: boolean) => {
        const l: Ligado = { tipo: x.tipo, id: x.id, descricao: x.descricao, valor: x.valor, info: x.info };
        muda({ ligados: on ? [...pag.ligados.filter((y) => !(y.tipo === x.tipo && y.id === x.id)), l] : pag.ligados.filter((y) => !(y.tipo === x.tipo && y.id === x.id)) });
    };

    const nParc = pag.parcelas.filter((x) => !x.entrada).length;
    const negociar = pag.ant === 'nao' || (pag.ant === 'sim' && pag.ligados.length > 0 && falta > 0);

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <SimNao
                rotulo="Houve antecipação?"
                valor={pag.ant === null ? null : pag.ant === 'sim'}
                desativado={desativado}
                onChange={(v) => muda({ ant: v ? 'sim' : 'nao', ligados: v ? pag.ligados : [], formaAnt: v ? pag.formaAnt : null })}
            />

            {pag.ant === 'sim' ? (
                <div className="flex flex-col gap-3">
                    <div className="max-w-[320px]">
                        <span className={ROTULO}>Forma da antecipação</span>
                        <Combo rotulo="Forma da antecipação" classe={CAMPO} opcoes={formasAnt} valor={pag.formaAnt} onChange={(v) => setPag((p) => ({ ...p, formaAnt: v }))} desativado={desativado} />
                    </div>
                    {!podeBuscar ? (
                        <p className={SUB}>Quem aprova a entrada (Contas a Pagar) liga o lançamento da antecipação.</p>
                    ) : !pessoaId ? (
                        <p className={SUB}>Escolha o fornecedor para buscar os lançamentos dele.</p>
                    ) : pag.formaAnt ? (
                        <div className="flex flex-col gap-2">
                            <span className={ROTULO}>
                                Lançamentos do fornecedor em {pag.formaAnt === CARTAO ? 'Cartão de Crédito' : 'Contas a Pagar'} ainda sem entrada
                            </span>
                            {buscando ? <p className={SUB}>Buscando…</p> : null}
                            {erroBusca ? <p className="text-[13.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erroBusca}</p> : null}
                            {achados && !lista.length ? (
                                <div className="rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] dark:bg-[#1C2334]">
                                    Nada encontrado {pag.formaAnt === CARTAO ? 'no cartão' : `em ${nomeFormaAnt}`} para esse fornecedor.{' '}
                                    {pag.formaAnt === CARTAO ? 'Lance a compra em Cartão de Crédito e volte aqui para ligar.' : 'Lance a conta paga no Contas a Pagar e volte aqui para ligar, ou responda Não e siga pela negociação.'}
                                </div>
                            ) : null}
                            {lista.map((x) => {
                                const on = pag.ligados.some((y) => y.tipo === x.tipo && y.id === x.id);
                                return (
                                    <label key={`${x.tipo}${x.id}`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 dark:bg-[#1C2334]">
                                        <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={on} onChange={(e) => marcar(x, e.target.checked)} disabled={desativado} />
                                        <span className="min-w-0">
                                            <b className="break-words">
                                                {x.descricao} · {brl(x.valor)}
                                            </b>
                                            {Math.abs(x.valor - total) < 0.005 ? <span className="ml-1.5 text-[13px] font-extrabold text-[#3F5A0A] dark:text-[#CFE38A]">mesmo valor da nota</span> : null}
                                            <span className={`block ${SUB}`}>{x.info}</span>
                                        </span>
                                    </label>
                                );
                            })}
                            {outrasFormas > 0 && !todos ? (
                                <button type="button" className={`${BTN_PEQ} self-start`} onClick={() => setTodos(true)}>
                                    Ver também {outrasFormas} {outrasFormas === 1 ? 'lançamento' : 'lançamentos'} em outras formas
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {negociar ? (
                <div className="flex flex-col gap-3">
                    <h3 className="text-[16px] font-extrabold">
                        Negociação <span className={`${SUB} font-bold`}>{pag.ant === 'sim' ? `falta ${brl(falta)} depois da antecipação` : `total ${brl(falta)}`}</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <SimNao rotulo="Tem entrada?" valor={pag.tem} desativado={desativado} onChange={(v) => muda({ tem: v, vEnt: v && !pag.vEnt ? numCampo(cent(falta * 0.2)) : pag.vEnt })} />
                        {pag.tem ? (
                            <>
                                <label>
                                    <span className={ROTULO}>Valor da entrada</span>
                                    <input className={CAMPO} inputMode="decimal" value={pag.vEnt} onChange={(e) => setPag((p) => ({ ...p, vEnt: e.target.value }))} onBlur={() => muda({})} disabled={desativado} />
                                </label>
                                <label>
                                    <span className={ROTULO}>Data da entrada</span>
                                    <input type="date" className={CAMPO} value={pag.dEnt} onChange={(e) => muda({ dEnt: e.target.value })} disabled={desativado} />
                                </label>
                                <div>
                                    <span className={ROTULO}>Forma da entrada</span>
                                    <Combo rotulo="Forma da entrada" classe={CAMPO} opcoes={formas} valor={pag.fEnt} onChange={(v) => muda({ fEnt: v })} desativado={desativado} />
                                </div>
                            </>
                        ) : null}
                        <label>
                            <span className={ROTULO}>Quantidade de parcelas</span>
                            <input className={CAMPO} inputMode="numeric" value={pag.qtd} onChange={(e) => muda({ qtd: e.target.value.replace(/\D/g, '').slice(0, 2) })} disabled={desativado} />
                        </label>
                        <div>
                            <span className={ROTULO}>Intervalo entre as parcelas</span>
                            <Combo
                                rotulo="Intervalo entre as parcelas"
                                classe={CAMPO}
                                opcoes={opcoesInt}
                                valor={pag.intervalo}
                                onChange={(v) => v && muda({ intervalo: v, p1: p1Padrao(v) })}
                                onTexto={setTxtInt}
                                placeholder="Escolha ou digite os dias"
                                desativado={desativado}
                            />
                            <span className={`mt-1 block ${SUB}`}>Digite um número para outro prazo (ex.: 20).</span>
                        </div>
                        <label>
                            <span className={ROTULO}>1º vencimento</span>
                            <input type="date" className={CAMPO} value={pag.p1} onChange={(e) => e.target.value && muda({ p1: e.target.value })} disabled={desativado} />
                        </label>
                        <div>
                            <span className={ROTULO}>Forma das parcelas</span>
                            <Combo rotulo="Forma das parcelas" classe={CAMPO} opcoes={formas} valor={pag.fParc} onChange={(v) => muda({ fParc: v })} desativado={desativado} />
                        </div>
                    </div>

                    {/* lista sem rolagem lateral, para a lista das formas não ficar cortada */}
                    <div className="flex flex-col">
                        <div className="hidden grid-cols-[86px_minmax(150px,1fr)_minmax(120px,0.8fr)_minmax(150px,1fr)_minmax(170px,1.3fr)] gap-2 border-b border-[#E3E8F0] px-1 pb-2 lg:grid dark:border-white/[0.12]">
                            {['Parcela', 'Vencimento', 'Valor', 'Forma', 'Linha digitável'].map((t) => (
                                <span key={t} className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                    {t}
                                </span>
                            ))}
                        </div>
                        {pag.parcelas.map((x, i) => {
                            const num = x.entrada ? 'Entrada' : `${i + 1 - (pag.parcelas[0]?.entrada ? 1 : 0)}/${nParc}`;
                            const ehBoleto = /boleto/i.test(base.formas.find((f) => f.id === x.forma_id)?.nome || '');
                            return (
                                <div key={i} className="grid grid-cols-2 items-start gap-2 border-b border-[#E3E8F0] px-1 py-2 lg:grid-cols-[86px_minmax(150px,1fr)_minmax(120px,0.8fr)_minmax(150px,1fr)_minmax(170px,1.3fr)] dark:border-white/[0.08]">
                                    <span className="col-span-2 self-center font-extrabold tabular-nums lg:col-span-1">{num}</span>
                                    <div>
                                        <input type="date" className={CAMPO_P} value={x.venc} onChange={(e) => mudaVenc(i, e.target.value)} aria-label={`Vencimento: ${num}`} disabled={desativado} />
                                        {x.era ? (
                                            <span className="mt-0.5 block text-[11.5px] font-extrabold text-[#7A5D00] dark:text-[#F2CB3F]">
                                                Era {DIA[dow(x.era)]} {dataBR(x.era)}: foi para {DIA[dow(x.venc)]}
                                            </span>
                                        ) : null}
                                    </div>
                                    <input className={`${CAMPO_P} text-right tabular-nums`} inputMode="decimal" value={x.valor} onChange={(e) => mudaParcela(i, { valor: e.target.value })} aria-label={`Valor: ${num}`} disabled={desativado} />
                                    <Combo rotulo={`Forma: ${num}`} classe={CAMPO_P} opcoes={formas} valor={x.forma_id} onChange={(v) => mudaParcela(i, { forma_id: v })} desativado={desativado} />
                                    {ehBoleto ? (
                                        <input className={CAMPO_P} inputMode="numeric" placeholder="Opcional" value={x.linha} onChange={(e) => mudaParcela(i, { linha: e.target.value })} aria-label={`Linha digitável: ${num}`} disabled={desativado} />
                                    ) : (
                                        <span className={`${SUB} self-center`}>—</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className={SUB}>
                        {pag.intervalo === 'livre' ? 'Datas livres: a lista sai com 30 dias de sugestão; digite o vencimento de cada parcela. ' : ''}
                        Vencimento no sábado ou no domingo vai para a segunda-feira. Datas e valores podem ser mudados à mão; mudar a entrada, a quantidade, o intervalo ou o 1º vencimento refaz a lista.
                    </p>
                </div>
            ) : null}
        </div>
    );
}

/** Faixa de conferência: antecipação + negociação contra o total da nota. */
export function ConferePagamento({ total, pag }: { total: number; pag: PagEnt }) {
    const lig = somaLigados(pag);
    const neg = somaParcelas(pag);
    const dif = cent(total - lig - neg);
    const ok = !!pag.ant && Math.abs(dif) < 0.005 && !(pag.ant === 'sim' && !pag.ligados.length);
    const msg = !pag.ant
        ? 'Pagamento ainda não preenchido: o financeiro completa na aprovação.'
        : pag.ant === 'sim' && !pag.ligados.length
          ? 'Ligue o lançamento da antecipação.'
          : ok
            ? `Bate com o total da nota (${brl(total)}).`
            : `${dif > 0 ? 'Faltam' : 'Passaram'} ${brl(Math.abs(dif))}: nota ${brl(total)}, antecipação ${brl(lig)}, negociado ${brl(neg)}.`;
    return (
        <div className={`rounded-xl px-3.5 py-2.5 text-[14px] font-extrabold ${ok ? 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]' : !pag.ant ? S_AVISO : 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]'}`}>
            {msg}
        </div>
    );
}

/* ============================== lista das entradas e a entrada aberta ============================== */

type ItemLista = {
    lancamento: string;
    data: string;
    deposito: string | null;
    operador: string | null;
    itens: number;
    unidades: number;
    total: number;
    situacao: 'pendente' | 'aprovada';
    sem_nota: boolean;
    sem_financeiro: boolean;
    documento: string | null;
    fornecedor: string | null;
    aprovado_em: string | null;
    aprovado_por: string | null;
};

const CHIP = (on: boolean) =>
    `inline-flex h-10 items-center rounded-full border px-3.5 text-[13.5px] font-extrabold ${on ? 'border-transparent bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]'}`;
const dataHora = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).toLocaleDateString('pt-BR') : '');

/**
 * Lista das entradas (desde 24/11/2026) com a situação. `so="pendente"` mostra só as pendentes (quadro do Contas a Pagar)
 * e some quando não há nenhuma. `recarga` muda quando uma entrada nova é lançada.
 */
export function ListaEntradas({ avisar, onMudou, so, recarga = 0, titulo }: { avisar: (m: string) => void; onMudou?: () => void; so?: 'pendente'; recarga?: number; titulo?: string }) {
    const [lista, setLista] = useState<ItemLista[] | null>(null);
    const [filtro, setFiltro] = useState<'todas' | 'pendente' | 'aprovada'>(so ?? 'todas');
    const [aberta, setAberta] = useState<string | null>(null);
    const [pode, setPode] = useState(false);
    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_ENT, 'lista', undefined, so ? `&situacao=${so}` : '');
            setLista(j.dados.entradas || []);
            setPode(!!j.dados.pode_aprovar);
        } catch {
            setLista([]);
        }
    }, [so]);
    useEffect(() => {
        void carregar();
    }, [carregar, recarga]);
    if (!lista) return null;
    if (so && !lista.length) return null;
    const vis = lista.filter((x) => filtro === 'todas' || x.situacao === filtro);
    const nPend = lista.filter((x) => x.situacao === 'pendente').length;
    const quadro = so ? 'rounded-2xl border border-[#F2CB3F]/60 bg-[#FCF3CC] p-4 dark:border-[#F2CB3F]/30 dark:bg-[#F2CB3F]/10' : 'rounded-2xl border border-[#E3E8F0] bg-white p-4 dark:border-white/[0.12] dark:bg-[#232B3F]';
    return (
        <div className={`flex min-w-0 flex-col gap-2.5 ${quadro}`}>
            <div className="flex flex-wrap items-center gap-2">
                <h2 className={`mr-auto text-[16px] font-extrabold ${so ? 'text-[#7A5D00] dark:text-[#F2CB3F]' : ''}`}>
                    {titulo ?? 'Entradas lançadas'} {so ? `(${lista.length})` : nPend ? <span className={`${SELO} ${S_AVISO} ml-1`}>{nPend} pendentes</span> : null}
                </h2>
                {!so ? (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Situação">
                        {(
                            [
                                ['todas', 'Todas'],
                                ['pendente', 'Pendentes'],
                                ['aprovada', 'Aprovadas'],
                            ] as const
                        ).map(([k, t]) => (
                            <button key={k} type="button" aria-pressed={filtro === k} className={CHIP(filtro === k)} onClick={() => setFiltro(k)}>
                                {t}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            {!vis.length ? <p className={SUB}>Nenhuma entrada {filtro === 'pendente' ? 'pendente' : filtro === 'aprovada' ? 'aprovada' : 'lançada'} desde 24/11/2026.</p> : null}
            {vis.map((x) => (
                <div key={x.lancamento} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 dark:bg-[#1C2334]">
                    <div className="min-w-[200px] flex-1">
                        <b className="break-words">
                            {x.lancamento} · {x.fornecedor || 'sem fornecedor'}
                            {x.documento ? ` · NF ${x.documento}` : ''}
                        </b>
                        <div className={SUB}>
                            {dataHora(x.data)} · {x.operador || '—'} · {x.deposito || '—'} · {x.unidades} un.
                            {x.situacao === 'aprovada' && x.aprovado_por ? ` · aprovada por ${x.aprovado_por} em ${dataHora(x.aprovado_em)}` : ''}
                            {x.sem_financeiro ? ' · sem conta a pagar' : ''}
                        </div>
                    </div>
                    <span className={`${SELO} ${x.situacao === 'pendente' ? S_AVISO : S_OK}`}>{x.situacao === 'pendente' ? (x.sem_nota ? 'Pendente · sem nota' : 'Pendente') : 'Aprovada'}</span>
                    <b className="tabular-nums">{brl(x.total)}</b>
                    <button type="button" className={BTN_PEQ} onClick={() => setAberta(x.lancamento)}>
                        {x.situacao === 'pendente' && pode ? 'Aprovar' : 'Abrir'}
                    </button>
                </div>
            ))}
            {aberta ? (
                <JanelaEntrada
                    lancamento={aberta}
                    avisar={avisar}
                    onFechar={() => setAberta(null)}
                    onMudou={() => {
                        void carregar();
                        onMudou?.();
                    }}
                />
            ) : null}
        </div>
    );
}

type Detalhe = {
    lancamento: string;
    data: string;
    deposito: string | null;
    operador: string | null;
    itens: { produto: string; quantidade: number; custo_base: number; frete: number }[];
    valor_itens: number;
    valor_frete: number;
    valor_total: number;
    nota: (Omit<NotaEnt, 'documento' | 'serie' | 'emissao'> & { documento: string | null; serie: string | null; emissao: string | null; situacao: 'pendente' | 'aprovada'; sem_financeiro: boolean; observacao: string | null; pagamento: any; aprovado_em: string | null; aprovado_por: string | null }) | null;
    ligados: { tipo: 'titulo' | 'compra'; id: number; descricao: string; valor: number; vencimento: string; situacao: string; forma: string | null; criado_pela_entrada: boolean }[];
    pode_aprovar: boolean;
};

/** A entrada aberta: itens, nota, pagamento e as ações (Salvar, Aprovar, Aprovar sem conta, Desaprovar). */
export function JanelaEntrada({ lancamento, avisar, onFechar, onMudou }: { lancamento: string; avisar: (m: string) => void; onFechar: () => void; onMudou: () => void }) {
    const { base, erro: erroBase, recarregar } = useBaseEnt();
    const [d, setD] = useState<Detalhe | null>(null);
    const [nota, setNotaS] = useState<NotaEnt>(notaVazia);
    const [pag, setPagS] = useState<PagEnt>(pagVazio);
    const setNota = useCallback((f: (n: NotaEnt) => NotaEnt) => setNotaS(f), []);
    const setPag = useCallback((f: (p: PagEnt) => PagEnt) => setPagS(f), []);
    const [modo, setModo] = useState<'' | 'sem' | 'desaprovar'>('');
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_ENT, 'entrada', undefined, `&lancamento=${encodeURIComponent(lancamento)}`);
            const x = j.dados as Detalhe;
            setD(x);
            if (x.nota) {
                setNotaS({ pessoa_id: x.nota.pessoa_id, documento: x.nota.documento || '', serie: x.nota.serie || '', emissao: x.nota.emissao || '', natureza_id: x.nota.natureza_id, area_id: x.nota.area_id, local_id: x.nota.local_id });
                setPagS(pagDoServidor(x.nota.pagamento));
            }
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível abrir a entrada.');
            if (m) setErro(m);
        }
    }, [lancamento]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const aprovada = d?.nota?.situacao === 'aprovada';
    const pode = !!d?.pode_aprovar;
    const total = d?.valor_total ?? 0;
    const faltaNota = notaProblemas(nota);
    const faltaAprovar = d ? aprovarProblemas(nota, pag, total) : [];

    const executar = async (acao: 'salvar' | 'aprovar' | 'aprovar_sem' | 'desaprovar') => {
        setSalvando(true);
        setErro('');
        try {
            const j =
                acao === 'salvar'
                    ? await salvarNota(lancamento, nota, pag)
                    : acao === 'aprovar'
                      ? await api(URL_ENT, 'aprovar', notaParaEnvio(lancamento, nota, pag, true))
                      : await api(URL_ENT, acao, { lancamento, motivo: motivo.trim() });
            avisar(j.msg);
            onMudou();
            if (acao === 'desaprovar') {
                setModo('');
                setMotivo('');
                await carregar();
            } else {
                onFechar();
            }
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) setErro(m);
        } finally {
            setSalvando(false);
        }
    };

    const rodape = !d ? (
        <button type="button" className={BTN_SEC} onClick={onFechar}>
            Voltar
        </button>
    ) : aprovada ? (
        <>
            <button type="button" className={BTN_SEC} onClick={() => (modo ? setModo('') : onFechar())}>
                Voltar
            </button>
            {pode ? (
                modo === 'desaprovar' ? (
                    <button type="button" className={BTN_PRI} disabled={!motivo.trim() || salvando} onClick={() => void executar('desaprovar')}>
                        {salvando ? 'Desaprovando…' : 'Desaprovar'}
                    </button>
                ) : (
                    <button type="button" className={BTN_SEC} onClick={() => setModo('desaprovar')}>
                        Desaprovar…
                    </button>
                )
            ) : null}
        </>
    ) : modo === 'sem' ? (
        <>
            <button type="button" className={BTN_SEC} onClick={() => setModo('')}>
                Voltar
            </button>
            <button type="button" className={BTN_PRI} disabled={!motivo.trim() || salvando} onClick={() => void executar('aprovar_sem')}>
                {salvando ? 'Aprovando…' : 'Aprovar sem conta a pagar'}
            </button>
        </>
    ) : (
        <>
            <button type="button" className={BTN_SEC} onClick={onFechar}>
                Voltar
            </button>
            {pode ? (
                <button type="button" className={BTN_SEC} onClick={() => setModo('sem')}>
                    Sem conta a pagar…
                </button>
            ) : null}
            <button type="button" className={pode ? BTN_SEC : BTN_PRI} disabled={faltaNota.length > 0 || salvando} onClick={() => void executar('salvar')}>
                Salvar
            </button>
            {pode ? (
                <button type="button" className={BTN_PRI} disabled={faltaAprovar.length > 0 || salvando} onClick={() => void executar('aprovar')}>
                    {salvando ? 'Salvando…' : 'Aprovar entrada'}
                </button>
            ) : null}
        </>
    );

    return (
        <Janela
            titulo={`Entrada ${lancamento}`}
            sub={
                d ? (
                    <span className="flex flex-wrap items-center gap-2">
                        <span className={`${SELO} ${aprovada ? S_OK : S_AVISO}`}>{aprovada ? 'Aprovada' : 'Pendente'}</span>
                        {d.deposito || '—'} · {dataHora(d.data)} · lançada por {d.operador || '—'}
                        {aprovada && d.nota?.aprovado_por ? ` · aprovada por ${d.nota.aprovado_por} em ${dataHora(d.nota.aprovado_em)}` : ''}
                    </span>
                ) : undefined
            }
            largura="max-w-5xl"
            onFechar={onFechar}
            rodape={rodape}
        >
            {!d || !base ? (
                <p className={SUB}>{erro || erroBase || 'Carregando a entrada…'}</p>
            ) : (
                <>
                    <section className="flex flex-col gap-2">
                        <h3 className="text-[16px] font-extrabold">Itens</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-[14px] tabular-nums">
                                <thead>
                                    <tr>
                                        {['Produto', 'Qtd', 'Custo un.', 'Frete', 'Total'].map((t, k) => (
                                            <th key={t} className={`px-2 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF] ${k ? 'text-right' : 'text-left'}`}>
                                                {t}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.itens.map((i, k) => (
                                        <tr key={k} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                            <td className="px-2 py-1.5">{i.produto}</td>
                                            <td className="px-2 py-1.5 text-right">{i.quantidade}</td>
                                            <td className="px-2 py-1.5 text-right">{brl(i.custo_base)}</td>
                                            <td className="px-2 py-1.5 text-right">{brl(i.frete)}</td>
                                            <td className="px-2 py-1.5 text-right">{brl(cent(i.custo_base * i.quantidade + i.frete))}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-t border-[#E3E8F0] font-extrabold dark:border-white/[0.08]">
                                        <td className="px-2 py-1.5">Total da nota</td>
                                        <td className="px-2 py-1.5 text-right">{d.itens.reduce((a, i) => a + i.quantidade, 0)}</td>
                                        <td />
                                        <td className="px-2 py-1.5 text-right">{brl(d.valor_frete)}</td>
                                        <td className="px-2 py-1.5 text-right">{brl(d.valor_total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={SUB}>Os itens já estão no estoque. Corrigir item ou quantidade é pelo ajuste do estoque.</p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h3 className="text-[16px] font-extrabold">Nota</h3>
                        <NotaCampos base={base} nota={nota} setNota={setNota} recarregarBase={recarregar} avisar={avisar} desativado={aprovada} />
                    </section>

                    <section className="flex flex-col gap-3">
                        <h3 className="text-[16px] font-extrabold">Pagamento</h3>
                        {aprovada ? (
                            d.nota?.sem_financeiro ? (
                                <p className="rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] dark:bg-[#1C2334]">Aprovada sem conta a pagar: {d.nota.observacao || '—'}</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {d.ligados.map((x) => (
                                        <div key={`${x.tipo}${x.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 dark:bg-[#1C2334]">
                                            <span className="min-w-[180px] flex-1 break-words font-bold">{x.descricao}</span>
                                            <span className={`${SELO} ${x.criado_pela_entrada ? (x.situacao === 'PAGO' ? S_OK : S_AVISO) : S_MUDO}`}>
                                                {x.criado_pela_entrada ? (x.situacao === 'PAGO' ? 'Paga' : 'Em aberto') : x.tipo === 'compra' ? 'Cartão · já existia' : 'Antecipação · já existia'}
                                            </span>
                                            <span className={SUB}>
                                                {x.tipo === 'compra' ? x.forma : `vence ${dataBR(x.vencimento)}${x.forma ? ` · ${x.forma}` : ''}`}
                                            </span>
                                            <b className="tabular-nums">{brl(x.valor)}</b>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            <>
                                <PagamentoCampos base={base} total={total} pessoaId={nota.pessoa_id} pag={pag} setPag={setPag} podeBuscar={pode} />
                                <ConferePagamento total={total} pag={pag} />
                            </>
                        )}
                    </section>

                    {modo ? (
                        <label>
                            <span className={ROTULO}>{modo === 'sem' ? 'Motivo para não gerar conta a pagar' : 'Motivo para desaprovar'}</span>
                            <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={modo === 'sem' ? 'Ex.: bonificação do fornecedor, doação' : 'Ex.: vencimentos errados'} autoFocus />
                            <span className={`mt-1 block ${SUB}`}>
                                {modo === 'sem'
                                    ? 'A entrada fica aprovada sem nenhuma conta no Contas a Pagar.'
                                    : 'As contas criadas por esta entrada são canceladas e as ligadas ficam livres de novo; a entrada volta para pendente. O estoque não muda. Só dá se nenhuma conta dela foi paga.'}
                            </span>
                        </label>
                    ) : null}
                    {!aprovada && !modo ? (
                        <p className={SUB}>
                            {pode
                                ? faltaAprovar.length
                                    ? `Para aprovar, falta: ${faltaAprovar.join(', ')}.`
                                    : 'Pronta para aprovar: as parcelas viram contas em aberto no Contas a Pagar.'
                                : 'Quem tem o Contas a Pagar confere o pagamento e aprova. Você pode deixar o pagamento preenchido e salvar.'}
                        </p>
                    ) : null}
                    {erro ? <p className="text-[13.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
                </>
            )}
        </Janela>
    );
}

/** Contas a Pagar: quadro "Entradas do estoque a aprovar" (some quando não há pendente). Props antigas aceitas. */
export function EntradasPendentes({ avisar, onMudou }: { cad?: unknown; recarregarCad?: unknown; avisar: (m: string) => void; onMudou: () => void }) {
    return <ListaEntradas so="pendente" titulo="Entradas do estoque a aprovar" avisar={avisar} onMudou={onMudou} />;
}
