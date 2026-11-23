'use client';

/**
 * Nota e pagamento de uma entrada do estoque (23/11/2026, prévia "Entrada com Pagamento" aprovada).
 * Usado na Entrada (Estoque › Movimentações) e no Contas a pagar ("Entradas do estoque sem conta a pagar").
 * Fornecedor só da lista (cadastro único); novo fornecedor pelo cadastro do financeiro (fin_base.php, ação pessoa).
 * Condição de pagamento livre: com ou sem entrada, intervalo em dias ou mesmo dia do mês, e cada parcela com
 * vencimento, valor e forma próprios (boleto, Pix, transferência...). Atalhos: À vista, 2x, 3x, 30/60/90, Entrada + 4.
 * Back-end: fin_entrada.php (gerar, dispensar, pendentes, entrada, ultima).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Combo } from '../../contratos/components/ct';
import {
    api,
    brl,
    BTN_PEQ,
    BTN_PRI,
    BTN_SEC,
    type Cadastros,
    CAMPO,
    CAMPO_P,
    diaMais,
    hojeISO,
    Janela,
    mensagemErro,
    numCampo,
    opcoesArea,
    paraNumero,
    ROTULO,
    SelectNatureza,
    URL_BASE,
} from './fin';

export const URL_ENT = 'https://api.planoassistencialintegrado.com.br/fin_entrada.php';

export type ParcelaEnt = { venc: string; valor: string; forma_id: number | null; linha: string; entrada: boolean };
export type NotaEnt = {
    pessoa_id: number | null;
    documento: string;
    serie: string;
    emissao: string; // AAAA-MM-DD
    natureza_id: number | null;
    area_id: number | null;
    local_id: number | null;
    parcelas: ParcelaEnt[];
};
type Cond = { comEntrada: boolean; n: string; vEntrada: string; dEntrada: string; p1: string; intervalo: string; dias: string; formaP: number | null; formaE: number | null };

export const notaVazia = (): NotaEnt => ({ pessoa_id: null, documento: '', serie: '', emissao: hojeISO(), natureza_id: null, area_id: null, local_id: null, parcelas: [] });

const cent = (v: number) => Math.round(v * 100) / 100;
const mesMaisDia = (iso: string, n: number) => {
    const [a, m, d] = iso.split('-').map(Number);
    const ult = new Date(a, m - 1 + n + 1, 0).getDate();
    const x = new Date(a, m - 1 + n, Math.min(d, ult));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Monta as parcelas da condição (valores iguais; a última fecha o centavo; a entrada pode ter valor próprio). */
function montar(c: Cond, total: number): ParcelaEnt[] {
    const n = Math.max(1, Math.min(60, Number(c.n) || 1));
    const out: ParcelaEnt[] = [];
    let resto = cent(total);
    if (c.comEntrada) {
        const ve = paraNumero(c.vEntrada) || 0;
        const v = ve > 0 ? Math.min(cent(ve), resto) : Math.floor((total / (n + 1)) * 100) / 100;
        out.push({ venc: c.dEntrada, valor: numCampo(v), forma_id: c.formaE, linha: '', entrada: true });
        resto = cent(resto - v);
    }
    const base = Math.floor((resto / n) * 100) / 100;
    const passo = c.intervalo === 'outro' ? Math.max(1, Number(c.dias) || 30) : Number(c.intervalo) || 30;
    for (let i = 0; i < n; i++) {
        const venc = c.intervalo === 'mes' ? mesMaisDia(c.p1, i) : diaMais(c.p1, i * passo);
        out.push({ venc, valor: numCampo(i === n - 1 ? cent(resto - base * (n - 1)) : base), forma_id: c.formaP, linha: '', entrada: false });
    }
    return out;
}

export const somaParcelas = (p: ParcelaEnt[]) => cent(p.reduce((a, x) => a + (paraNumero(x.valor) || 0), 0));

/** O que falta para gerar o contas a pagar (vazio = pode seguir). */
export function notaProblemas(n: NotaEnt, total: number): string[] {
    const f: string[] = [];
    if (!n.pessoa_id) f.push('fornecedor');
    if (!n.natureza_id) f.push('natureza');
    if (!n.area_id) f.push('área');
    if (!n.parcelas.length) f.push('parcelas');
    if (n.parcelas.some((p) => !p.venc || !(paraNumero(p.valor) || 0) || !p.forma_id)) f.push('vencimento, valor e forma de todas as parcelas');
    if (n.parcelas.length && Math.abs(somaParcelas(n.parcelas) - cent(total)) > 0.009) f.push('parcelas somando o total');
    return f;
}

export function notaParaEnvio(n: NotaEnt, lancamento: string) {
    return {
        lancamento,
        pessoa_id: n.pessoa_id,
        documento: n.documento.trim() || null,
        serie: n.serie.trim() || null,
        emissao: n.emissao || null,
        natureza_id: n.natureza_id,
        area_id: n.area_id,
        local_id: n.local_id,
        parcelas: n.parcelas.map((p) => ({ vencimento: p.venc, valor: paraNumero(p.valor), forma_id: p.forma_id, linha_digitavel: p.linha.replace(/\D/g, '') || null, entrada: p.entrada })),
    };
}

const ATALHOS: { k: string; t: string; c: Partial<Cond> }[] = [
    { k: 'vista', t: 'À vista', c: { comEntrada: false, n: '1', intervalo: '30' } },
    { k: '2x', t: '2x', c: { comEntrada: false, n: '2', intervalo: '30' } },
    { k: '3x', t: '3x', c: { comEntrada: false, n: '3', intervalo: '30' } },
    { k: '306090', t: '30/60/90', c: { comEntrada: false, n: '3', intervalo: '30' } },
    { k: 'ent4', t: 'Entrada + 4', c: { comEntrada: true, n: '4', intervalo: '30' } },
];
const INTERVALOS: [string, string][] = [
    ['30', 'A cada 30 dias'],
    ['mes', 'Mesmo dia de cada mês'],
    ['7', 'A cada 7 dias'],
    ['10', 'A cada 10 dias'],
    ['14', 'A cada 14 dias'],
    ['15', 'A cada 15 dias'],
    ['21', 'A cada 21 dias'],
    ['28', 'A cada 28 dias'],
    ['45', 'A cada 45 dias'],
    ['60', 'A cada 60 dias'],
    ['outro', 'Outro (em dias)'],
];
const CHIP = 'inline-flex h-10 items-center rounded-full border px-3.5 text-[13.5px] font-extrabold';
const CHIP_ON = 'border-transparent bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]';
const CHIP_OFF = 'border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]';
const TH = 'px-2 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';

/**
 * Seção "Nota e pagamento". Controlada: `nota`/`setNota`. `total` = itens + frete da entrada.
 * As parcelas são remontadas quando a condição ou o total mudam; ajustes à mão valem até a próxima mudança da condição.
 */
export function NotaPagamento({ cad, recarregarCad, total, nota, setNota, avisar }: { cad: Cadastros; recarregarCad: () => Promise<unknown>; total: number; nota: NotaEnt; setNota: (f: (n: NotaEnt) => NotaEnt) => void; avisar: (m: string) => void }) {
    const formas = cad.formas.filter((f) => f.ativo);
    const achaForma = (re: RegExp) => formas.find((f) => re.test(`${f.codigo} ${f.nome}`))?.id ?? formas[0]?.id ?? null;
    const hoje = hojeISO();
    const [cond, setCond] = useState<Cond>(() => ({
        comEntrada: false,
        n: '1',
        vEntrada: '',
        dEntrada: hoje,
        p1: hoje,
        intervalo: '30',
        dias: '30',
        formaP: achaForma(/boleto/i),
        formaE: achaForma(/pix/i),
    }));
    const [atalho, setAtalho] = useState<string | null>('vista');
    const [novoForn, setNovoForn] = useState<string | null>(null);

    // remonta as parcelas quando a condição ou o total mudam
    useEffect(() => {
        setNota((n) => ({ ...n, parcelas: montar(cond, total) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cond, total]);

    const set = (p: Partial<NotaEnt>) => setNota((n) => ({ ...n, ...p }));
    const muda = (p: Partial<Cond>, manterAtalho = false) => {
        setCond((c) => ({ ...c, ...p }));
        if (!manterAtalho) setAtalho(null);
    };
    const usarAtalho = (k: string) => {
        const a = ATALHOS.find((x) => x.k === k);
        if (!a) return;
        setCond((c) => ({ ...c, vEntrada: '', dEntrada: hoje, p1: k === 'vista' ? hoje : diaMais(hoje, 30), ...a.c }));
        setAtalho(k);
    };
    const mudaParcela = (i: number, p: Partial<ParcelaEnt>) => setNota((n) => ({ ...n, parcelas: n.parcelas.map((x, j) => (j === i ? { ...x, ...p } : x)) }));

    // fornecedor: natureza padrão do cadastro ou a da última conta dele
    const fornecedores = useMemo(() => cad.pessoas.filter((p) => p.ativo && p.fornecedor).map((p) => ({ v: p.id, t: p.nome, s: p.documento || undefined })), [cad.pessoas]);
    const ultimoPedido = useRef(0);
    const escolherFornecedor = async (id: number | null) => {
        set({ pessoa_id: id });
        if (!id) return;
        const pad = cad.pessoas.find((p) => p.id === id)?.natureza_padrao_id ?? null;
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

    const soma = somaParcelas(nota.parcelas);
    const dif = cent(total - soma);
    const nParc = nota.parcelas.filter((p) => !p.entrada).length;

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                    <span className={ROTULO}>Fornecedor</span>
                    <Combo rotulo="Fornecedor" opcoes={fornecedores} valor={nota.pessoa_id} onChange={(v) => void escolherFornecedor(v)} placeholder="Digite parte do nome ou do CNPJ" novo="+ Cadastrar fornecedor" onNovo={(t) => setNovoForn(t)} />
                </div>
                <label>
                    <span className={ROTULO}>Nº da nota</span>
                    <input className={CAMPO} value={nota.documento} onChange={(e) => set({ documento: e.target.value })} inputMode="numeric" />
                </label>
                <label>
                    <span className={ROTULO}>Série</span>
                    <input className={CAMPO} value={nota.serie} onChange={(e) => set({ serie: e.target.value })} />
                </label>
                <label>
                    <span className={ROTULO}>Emissão</span>
                    <input type="date" className={CAMPO} value={nota.emissao} max={hoje} onChange={(e) => set({ emissao: e.target.value })} />
                </label>
                <label>
                    <span className={ROTULO}>Natureza</span>
                    <SelectNatureza cad={cad} value={nota.natureza_id} onChange={(id) => set({ natureza_id: id })} classe={CAMPO} />
                </label>
                <label>
                    <span className={ROTULO}>Área</span>
                    <select className={CAMPO} value={nota.area_id ?? ''} onChange={(e) => set({ area_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Área</option>
                        {opcoesArea(cad).map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.nome}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span className={ROTULO}>Local (opcional)</span>
                    <select className={CAMPO} value={nota.local_id ?? ''} onChange={(e) => set({ local_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Sem local</option>
                        {cad.locais
                            .filter((l) => l.ativo)
                            .map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.nome}
                                </option>
                            ))}
                    </select>
                </label>
            </div>

            <div className="flex flex-col gap-3">
                <span className={ROTULO}>Condição de pagamento</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de condição">
                    {ATALHOS.map((a) => (
                        <button key={a.k} type="button" aria-pressed={atalho === a.k} className={`${CHIP} ${atalho === a.k ? CHIP_ON : CHIP_OFF}`} onClick={() => usarAtalho(a.k)}>
                            {a.t}
                        </button>
                    ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label>
                        <span className={ROTULO}>Parcelas</span>
                        <input className={CAMPO} inputMode="numeric" value={cond.n} onChange={(e) => muda({ n: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                    </label>
                    <div>
                        <span className={ROTULO}>Entrada</span>
                        <div className="flex h-12 gap-1 rounded-xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]" role="group" aria-label="Entrada">
                            {[
                                [true, 'Com entrada'],
                                [false, 'Sem entrada'],
                            ].map(([v, t]) => (
                                <button
                                    key={String(v)}
                                    type="button"
                                    aria-pressed={cond.comEntrada === v}
                                    onClick={() => muda({ comEntrada: v as boolean })}
                                    className={`flex-1 rounded-lg text-[13.5px] font-extrabold ${cond.comEntrada === v ? 'bg-white text-[#313C55] shadow-sm dark:bg-[#232B3F] dark:text-white' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}
                                >
                                    {t as string}
                                </button>
                            ))}
                        </div>
                    </div>
                    {cond.comEntrada ? (
                        <>
                            <label>
                                <span className={ROTULO}>Valor da entrada</span>
                                <input className={CAMPO} inputMode="decimal" placeholder="Igual às parcelas" value={cond.vEntrada} onChange={(e) => muda({ vEntrada: e.target.value })} />
                            </label>
                            <label>
                                <span className={ROTULO}>Data da entrada</span>
                                <input type="date" className={CAMPO} value={cond.dEntrada} onChange={(e) => muda({ dEntrada: e.target.value })} />
                            </label>
                            <label>
                                <span className={ROTULO}>Forma da entrada</span>
                                <select className={CAMPO} value={cond.formaE ?? ''} onChange={(e) => muda({ formaE: e.target.value ? Number(e.target.value) : null })}>
                                    {formas.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.nome}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </>
                    ) : null}
                    <label>
                        <span className={ROTULO}>{cond.comEntrada ? '1º vencimento das parcelas' : '1º vencimento'}</span>
                        <input type="date" className={CAMPO} value={cond.p1} onChange={(e) => muda({ p1: e.target.value })} />
                    </label>
                    <label>
                        <span className={ROTULO}>Intervalo</span>
                        <select className={CAMPO} value={cond.intervalo} onChange={(e) => muda({ intervalo: e.target.value })}>
                            {INTERVALOS.map(([v, t]) => (
                                <option key={v} value={v}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </label>
                    {cond.intervalo === 'outro' ? (
                        <label>
                            <span className={ROTULO}>Dias entre parcelas</span>
                            <input className={CAMPO} inputMode="numeric" value={cond.dias} onChange={(e) => muda({ dias: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                        </label>
                    ) : null}
                    <label>
                        <span className={ROTULO}>Forma das parcelas</span>
                        <select className={CAMPO} value={cond.formaP ?? ''} onChange={(e) => muda({ formaP: e.target.value ? Number(e.target.value) : null })}>
                            {formas.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[14.5px] tabular-nums">
                    <thead>
                        <tr>
                            <th className={TH}>Parcela</th>
                            <th className={TH}>Vencimento</th>
                            <th className={`${TH} text-right`}>Valor</th>
                            <th className={TH}>Forma</th>
                            <th className={TH}>Linha digitável</th>
                        </tr>
                    </thead>
                    <tbody>
                        {nota.parcelas.map((p, i) => {
                            const ehBoleto = /boleto/i.test(formas.find((f) => f.id === p.forma_id)?.nome || '');
                            const num = p.entrada ? 'Entrada' : `${i + 1 - (nota.parcelas[0]?.entrada ? 1 : 0)}/${nParc}`;
                            return (
                                <tr key={i} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                    <td className="whitespace-nowrap px-2 py-1.5 font-extrabold">{num}</td>
                                    <td className="px-2 py-1.5">
                                        <input type="date" className={CAMPO_P} value={p.venc} onChange={(e) => mudaParcela(i, { venc: e.target.value })} aria-label={`Vencimento: ${num}`} />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input className={`${CAMPO_P} w-32 text-right`} inputMode="decimal" value={p.valor} onChange={(e) => mudaParcela(i, { valor: e.target.value })} aria-label={`Valor: ${num}`} />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <select className={CAMPO_P} value={p.forma_id ?? ''} onChange={(e) => mudaParcela(i, { forma_id: e.target.value ? Number(e.target.value) : null })} aria-label={`Forma: ${num}`}>
                                            {formas.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1.5">
                                        {ehBoleto ? (
                                            <input className={`${CAMPO_P} min-w-[180px]`} inputMode="numeric" placeholder="Opcional" value={p.linha} onChange={(e) => mudaParcela(i, { linha: e.target.value })} aria-label={`Linha digitável: ${num}`} />
                                        ) : (
                                            <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div
                    className={`flex-1 rounded-xl px-3.5 py-2.5 text-[14px] font-extrabold ${
                        Math.abs(dif) < 0.005 ? 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]' : 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]'
                    }`}
                >
                    {Math.abs(dif) < 0.005 ? `As parcelas fecham com o total (${brl(total)}).` : `${dif > 0 ? 'Faltam' : 'Sobram'} ${brl(Math.abs(dif))} nas parcelas: total ${brl(total)}, parcelas ${brl(soma)}.`}
                </div>
                <button type="button" className={BTN_PEQ} onClick={() => setNota((n) => ({ ...n, parcelas: montar(cond, total) }))}>
                    Redistribuir
                </button>
            </div>
            <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Data, valor e forma de cada parcela podem ser mudados à mão. Cada parcela vira um título em aberto no Contas a pagar.</p>

            {novoForn !== null ? (
                <JanelaFornecedor
                    cad={cad}
                    nomeInicial={novoForn}
                    onFechar={() => setNovoForn(null)}
                    onSalvo={async (id) => {
                        await recarregarCad();
                        setNovoForn(null);
                        void escolherFornecedor(id);
                        avisar('Fornecedor cadastrado.');
                    }}
                />
            ) : null}
        </div>
    );
}

/** Cadastro de fornecedor (cadastro único do financeiro: fin_base.php, ação pessoa). */
export function JanelaFornecedor({ cad, nomeInicial, onFechar, onSalvo }: { cad: Cadastros; nomeInicial: string; onFechar: () => void; onSalvo: (id: number) => Promise<void> | void }) {
    const [f, setF] = useState({ nome: nomeInicial, documento: '', telefone: '', email: '', natureza_padrao_id: null as number | null, pix_tipo: '', pix_chave: '' });
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const doc = f.documento.replace(/\D/g, '');
    const docOk = doc === '' || doc.length === 11 || doc.length === 14;
    const salvar = async () => {
        setSalvando(true);
        setErro('');
        try {
            const j = await api(URL_BASE, 'pessoa', {
                nome: f.nome.trim(),
                documento: doc || null,
                telefone: f.telefone.trim() || null,
                email: f.email.trim() || null,
                natureza_padrao_id: f.natureza_padrao_id,
                pix_tipo: f.pix_tipo || null,
                pix_chave: f.pix_chave.trim() || null,
                fornecedor: true,
                cliente: false,
                ativo: true,
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
            sub="Entra no cadastro único (clientes e fornecedores) do financeiro."
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
                <label>
                    <span className={ROTULO}>Natureza padrão</span>
                    <SelectNatureza cad={cad} value={f.natureza_padrao_id} onChange={(id) => setF({ ...f, natureza_padrao_id: id })} classe={CAMPO} />
                </label>
                <label>
                    <span className={ROTULO}>Tipo da chave Pix</span>
                    <select className={CAMPO} value={f.pix_tipo} onChange={(e) => setF({ ...f, pix_tipo: e.target.value })}>
                        <option value="">Sem Pix</option>
                        {['CNPJ', 'CPF', 'Telefone', 'E-mail', 'Aleatória'].map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span className={ROTULO}>Chave Pix</span>
                    <input className={CAMPO} value={f.pix_chave} onChange={(e) => setF({ ...f, pix_chave: e.target.value })} disabled={!f.pix_tipo} />
                </label>
            </div>
            {erro ? <p className="text-[13.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
        </Janela>
    );
}

/* ============================== Contas a pagar: entradas sem conta a pagar ============================== */

type Pendente = { lancamento: string; data: string; deposito: string | null; operador: string | null; itens: number; unidades: number; total: number };
type Lancamento = { lancamento: string; data: string; deposito: string | null; operador: string | null; itens: { produto: string; quantidade: number; custo_base: number; frete: number }[]; valor_itens: number; valor_frete: number; valor_total: number };

/** Quadro "Entradas do estoque sem conta a pagar" (some quando não há nenhuma). */
export function EntradasPendentes({ cad, recarregarCad, avisar, onMudou }: { cad: Cadastros; recarregarCad: () => Promise<unknown>; avisar: (m: string) => void; onMudou: () => void }) {
    const [lista, setLista] = useState<Pendente[]>([]);
    const [aberto, setAberto] = useState<string | null>(null);
    const carregar = React.useCallback(async () => {
        try {
            const j = await api(URL_ENT, 'pendentes');
            setLista(j.dados.pendentes || []);
        } catch {
            setLista([]);
        }
    }, []);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    if (!lista.length) return null;
    return (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#F2CB3F]/60 bg-[#FCF3CC] p-4 dark:border-[#F2CB3F]/30 dark:bg-[#F2CB3F]/10">
            <h2 className="text-[16px] font-extrabold text-[#7A5D00] dark:text-[#F2CB3F]">Entradas do estoque sem conta a pagar ({lista.length})</h2>
            {lista.map((p) => (
                <div key={p.lancamento} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 dark:bg-[#232B3F]">
                    <div className="min-w-[200px] flex-1">
                        <b className="tabular-nums">
                            {p.lancamento} · {p.deposito || '—'} · {brl(p.total)}
                        </b>
                        <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                            {new Date(p.data.replace(' ', 'T')).toLocaleDateString('pt-BR')} · {p.operador || '—'} · {p.itens} {p.itens === 1 ? 'item' : 'itens'}, {p.unidades} un.
                        </div>
                    </div>
                    <button type="button" className={BTN_PEQ} onClick={() => setAberto(p.lancamento)}>
                        Completar pagamento
                    </button>
                </div>
            ))}
            {aberto ? (
                <JanelaCompletar
                    cad={cad}
                    recarregarCad={recarregarCad}
                    lancamento={aberto}
                    avisar={avisar}
                    onFechar={() => setAberto(null)}
                    onFeito={() => {
                        setAberto(null);
                        void carregar();
                        onMudou();
                    }}
                />
            ) : null}
        </div>
    );
}

function JanelaCompletar({ cad, recarregarCad, lancamento, avisar, onFechar, onFeito }: { cad: Cadastros; recarregarCad: () => Promise<unknown>; lancamento: string; avisar: (m: string) => void; onFechar: () => void; onFeito: () => void }) {
    const [l, setL] = useState<Lancamento | null>(null);
    const [nota, setNotaS] = useState<NotaEnt>(notaVazia);
    const setNota = React.useCallback((f: (n: NotaEnt) => NotaEnt) => setNotaS(f), []);
    const [sem, setSem] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    useEffect(() => {
        (async () => {
            try {
                const j = await api(URL_ENT, 'entrada', undefined, `&lancamento=${encodeURIComponent(lancamento)}`);
                setL(j.dados);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível abrir a entrada.');
                if (m) setErro(m);
            }
        })();
    }, [lancamento]);
    const falta = l ? notaProblemas(nota, l.valor_total) : [];
    const salvar = async () => {
        setSalvando(true);
        setErro('');
        try {
            const j = sem ? await api(URL_ENT, 'dispensar', { lancamento, motivo: motivo.trim() }) : await api(URL_ENT, 'gerar', notaParaEnvio(nota, lancamento));
            avisar(j.msg);
            onFeito();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) setErro(m);
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo={`Pagamento da entrada ${lancamento}`}
            sub={l ? `${l.deposito || '—'} · ${new Date(l.data.replace(' ', 'T')).toLocaleDateString('pt-BR')} · ${l.operador || '—'}` : undefined}
            largura="max-w-5xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!l || salvando || (sem ? !motivo.trim() : falta.length > 0)} onClick={() => void salvar()}>
                        {salvando ? 'Salvando…' : sem ? 'Marcar sem conta a pagar' : 'Gerar contas a pagar'}
                    </button>
                </>
            }
        >
            {l ? (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-[14px] tabular-nums">
                            <thead>
                                <tr>
                                    <th className={TH}>Produto</th>
                                    <th className={`${TH} text-right`}>Qtd</th>
                                    <th className={`${TH} text-right`}>Custo un.</th>
                                    <th className={`${TH} text-right`}>Frete</th>
                                </tr>
                            </thead>
                            <tbody>
                                {l.itens.map((i, k) => (
                                    <tr key={k} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                        <td className="px-2 py-1.5">{i.produto}</td>
                                        <td className="px-2 py-1.5 text-right">{i.quantidade}</td>
                                        <td className="px-2 py-1.5 text-right">{brl(i.custo_base)}</td>
                                        <td className="px-2 py-1.5 text-right">{brl(i.frete)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[14px]">
                        Itens {brl(l.valor_itens)} + frete {brl(l.valor_frete)} = <b>{brl(l.valor_total)}</b>
                    </p>
                    <label className="flex min-h-11 items-center gap-2 text-[14px] font-bold">
                        <input type="checkbox" className="size-5" checked={sem} onChange={(e) => setSem(e.target.checked)} />
                        Esta entrada não gera conta a pagar (doação, bonificação do fornecedor, devolução...)
                    </label>
                    {sem ? (
                        <label>
                            <span className={ROTULO}>Motivo</span>
                            <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: bonificação do fornecedor" />
                        </label>
                    ) : (
                        <NotaPagamento cad={cad} recarregarCad={recarregarCad} total={l.valor_total} nota={nota} setNota={setNota} avisar={avisar} />
                    )}
                    {!sem && falta.length ? <p className="text-[13px] font-bold text-[#7A5D00] dark:text-[#F2CB3F]">Falta: {falta.join(', ')}.</p> : null}
                </>
            ) : !erro ? (
                <p className="text-[14px] text-[#5B6478]">Carregando a entrada…</p>
            ) : null}
            {erro ? <p className="text-[13.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
        </Janela>
    );
}
