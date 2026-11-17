'use client';

/**
 * Provisão do ano — 17/11/2026. Back-end: fin_provisao.php (mesma tabela fin_orcamento da aba Mês).
 *   GradeProvisao: naturezas × 12 meses + ano, gerar a partir do realizado / média de 3 meses / provisão do ano anterior
 *                  com reajuste (só células vazias), tocar no valor para mudar e "Repetir nos meses seguintes".
 *   OrcadoRealizado: o ano até o mês atual, com a barra do quanto já foi usado (acima de 100% fica em alerta).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconRefresh, IconWand } from '@tabler/icons-react';
import { api, brl, BTN_PRI, BTN_SEC, CAMPO, CAMPO_P, CARTAO, ERRO, Janela, mensagemErro, NOTA, paraNumero, ROTULO, SUB } from '../../contas-pagar/components/fin';

export const URL_PROVISAO = 'https://api.planoassistencialintegrado.com.br/fin_provisao.php';

type Nat = { id: number; codigo: string; pai: string | null; nome: string; grupo: boolean; classe: string | null; ativo: boolean };
type PorMes = Record<string, Record<string, number>>;
type DadosAno = {
    ano: number;
    filtro: string;
    mes_atual: string;
    naturezas: Nat[];
    provisao: PorMes;
    realizado: PorMes;
    divididas: Record<string, Record<string, boolean>>;
    areas: { id: number; nome: string }[];
    locais: { id: number; nome: string }[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const M12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const num = (v: number) => (Math.abs(v) < 0.005 ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const DESPESAS = ['DEDUCAO', 'CUSTO_VARIAVEL', 'CUSTO_FIXO', 'DESPESA'];

function anoPadrao() {
    const d = new Date();
    return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear(); // a partir de outubro, o ano seguinte
}

/** Carrega a grade do ano e monta a árvore (grupos somam sozinhos). */
function useAno(ano: number, filtro: string) {
    const [d, setD] = useState<DadosAno | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_PROVISAO, 'ano', undefined, `&ano=${ano}&filtro=${encodeURIComponent(filtro)}`);
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar a provisão.');
            if (m) setErro(m);
        }
    }, [ano, filtro]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const arvore = useMemo(() => {
        if (!d) return null;
        const porCod = new Map(d.naturezas.map((n) => [n.codigo, n]));
        const classe = (n: Nat): string | null => {
            let x: Nat | undefined = n;
            let g = 0;
            while (x && g++ < 6) {
                if (x.classe) return x.classe;
                x = x.pai ? porCod.get(x.pai) : undefined;
            }
            return null;
        };
        const filhos = new Map<string, Nat[]>();
        d.naturezas.forEach((n) => {
            const k = n.pai || '';
            filhos.set(k, [...(filhos.get(k) || []), n]);
        });
        const val = (src: PorMes, id: number, m: number) => Number(src[String(id)]?.[String(m)] ?? 0);
        return { porCod, classe, filhos, val };
    }, [d]);

    return { d, erro, carregar, arvore };
}

type Linha = { n: Nat; nivel: number; prov: number[]; real: number[]; folha: boolean };

/** Linhas visíveis na ordem do plano de contas: grupos com a soma das naturezas de baixo. */
function montarLinhas(d: DadosAno, arv: NonNullable<ReturnType<typeof useAno>['arvore']>, todas: boolean): Linha[] {
    const out: Linha[] = [];
    const visita = (n: Nat, nivel: number): { prov: number[]; real: number[]; tem: boolean } => {
        if (!n.grupo) {
            const prov = M12.map((m) => arv.val(d.provisao, n.id, m));
            const real = M12.map((m) => arv.val(d.realizado, n.id, m));
            const tem = prov.some((v) => Math.abs(v) >= 0.005) || real.some((v) => Math.abs(v) >= 0.005);
            if (tem || (todas && n.ativo)) out.push({ n, nivel, prov, real, folha: true });
            return { prov, real, tem: tem || (todas && n.ativo) };
        }
        const pos = out.length;
        const prov = M12.map(() => 0);
        const real = M12.map(() => 0);
        let tem = false;
        (arv.filhos.get(n.codigo) || []).forEach((f) => {
            const r = visita(f, nivel + 1);
            if (r.tem) tem = true;
            M12.forEach((_, i) => {
                prov[i] += r.prov[i];
                real[i] += r.real[i];
            });
        });
        if (tem) out.splice(pos, 0, { n, nivel, prov, real, folha: false });
        return { prov, real, tem };
    };
    (arv.filhos.get('') || []).forEach((n) => visita(n, 0));
    return out;
}

function FiltroArea({ d, valor, onChange }: { d: DadosAno | null; valor: string; onChange: (v: string) => void }) {
    return (
        <select className={CAMPO_P} value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Área e local">
            <option value="">Todas as áreas e locais</option>
            {d?.areas.length ? (
                <optgroup label="Área de negócio">
                    {d.areas.map((a) => (
                        <option key={a.id} value={`a${a.id}`}>
                            {a.nome}
                        </option>
                    ))}
                </optgroup>
            ) : null}
            {d?.locais.length ? (
                <optgroup label="Local">
                    {d.locais.map((l) => (
                        <option key={l.id} value={`l${l.id}`}>
                            {l.nome}
                        </option>
                    ))}
                </optgroup>
            ) : null}
        </select>
    );
}

function SeletorAno({ ano, onChange }: { ano: number; onChange: (a: number) => void }) {
    const atual = new Date().getFullYear();
    return (
        <select className={CAMPO_P} value={ano} onChange={(e) => onChange(Number(e.target.value))} aria-label="Ano">
            {[atual + 1, atual, atual - 1].map((a) => (
                <option key={a} value={a}>
                    {a}
                </option>
            ))}
        </select>
    );
}

/* ============================== Grade do ano ============================== */

export function GradeProvisao({ avisar }: { avisar: (m: string) => void }) {
    const [ano, setAno] = useState(anoPadrao());
    const [filtro, setFiltro] = useState('');
    const [todas, setTodas] = useState(false);
    const [base, setBase] = useState<'realizado' | 'media3' | 'provisao'>('realizado');
    const [reaj, setReaj] = useState('');
    const [gerando, setGerando] = useState(false);
    const [cel, setCel] = useState<{ n: Nat; m: number; valor: number } | null>(null);
    const { d, erro, carregar, arvore } = useAno(ano, filtro);
    const [erroAcao, setErroAcao] = useState<string | null>(null);

    const linhas = useMemo(() => (d && arvore ? montarLinhas(d, arvore, todas) : []), [d, arvore, todas]);
    const resultado = useMemo(() => {
        if (!d || !arvore) return null;
        const r = M12.map(() => 0);
        linhas
            .filter((l) => l.folha)
            .forEach((l) => {
                const c = arvore.classe(l.n);
                const s = c === 'RECEITA' ? 1 : c === null || DESPESAS.includes(c) ? -1 : 0;
                l.prov.forEach((v, i) => (r[i] += s * v));
            });
        return r;
    }, [d, arvore, linhas]);

    const gerar = async () => {
        const r = reaj.trim() ? paraNumero(reaj) : 0;
        if (r === null || Number.isNaN(r)) return setErroAcao('Reajuste inválido.');
        setGerando(true);
        setErroAcao(null);
        try {
            const j = await api(URL_PROVISAO, 'gerar', { ano, filtro, base, reajuste: r });
            avisar(j.msg);
            await carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível gerar.');
            if (m) setErroAcao(m);
        } finally {
            setGerando(false);
        }
    };

    const baseNome = { realizado: `Realizado de ${ano - 1}`, media3: 'Média dos últimos 3 meses', provisao: `Provisão de ${ano - 1}` };

    return (
        <div className="flex flex-col gap-3">
            <div className={`${CARTAO} flex flex-wrap items-end gap-3 p-3.5`}>
                <label className="w-[110px]">
                    <span className={ROTULO}>Ano</span>
                    <SeletorAno ano={ano} onChange={setAno} />
                </label>
                <label className="min-w-[200px] flex-1 sm:flex-none">
                    <span className={ROTULO}>Área e local</span>
                    <FiltroArea d={d} valor={filtro} onChange={setFiltro} />
                </label>
                <label className="min-w-[200px] flex-1 sm:flex-none">
                    <span className={ROTULO}>Partir de</span>
                    <select className={CAMPO_P} value={base} onChange={(e) => setBase(e.target.value as typeof base)}>
                        {(Object.keys(baseNome) as (keyof typeof baseNome)[]).map((k) => (
                            <option key={k} value={k}>
                                {baseNome[k]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="w-[110px]">
                    <span className={ROTULO}>Reajuste %</span>
                    <input className={CAMPO_P} inputMode="decimal" placeholder="0" value={reaj} onChange={(e) => setReaj(e.target.value)} />
                </label>
                <button type="button" className={BTN_PRI} disabled={gerando || !d} onClick={() => void gerar()}>
                    <IconWand size={18} /> {gerando ? 'Gerando…' : `Gerar ${ano}`}
                </button>
                <button type="button" className={BTN_SEC} onClick={() => void carregar()} aria-label="Atualizar">
                    <IconRefresh size={18} />
                </button>
            </div>
            <div className={SUB}>
                Gerar preenche só as células vazias; o que já foi digitado fica. Toque num valor para mudar. {filtro ? 'Neste recorte, cada célula é a meta só desta área ou deste local.' : 'Em "Todas", a célula soma todas as metas do mês; as divididas por área, local ou veículo (com *) mudam na aba Mês ou no recorte.'}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {erroAcao ? <div className={ERRO}>{erroAcao}</div> : null}
            {!d && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
            {d ? (
                <>
                    <label className="flex items-center gap-2 self-start text-[14px] font-bold">
                        <input type="checkbox" className="size-5 accent-[#313C55]" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
                        Mostrar todas as naturezas (também as sem valor)
                    </label>
                    {linhas.length === 0 ? (
                        <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Sem provisão nem realizado em {ano}. Use Gerar ou marque "Mostrar todas as naturezas".</div>
                    ) : (
                        <div className={`${CARTAO} overflow-x-auto`}>
                            <table className="w-full min-w-[1180px] border-collapse text-[13.5px] tabular-nums">
                                <thead>
                                    <tr className="bg-[#F6F8FB] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                        <th className="sticky left-0 z-[1] min-w-[170px] sm:min-w-[230px] bg-[#F6F8FB] px-3 py-2.5 text-left dark:bg-[#1C2334]">Natureza</th>
                                        {MESES.map((m) => (
                                            <th key={m} className="px-2 py-2.5 text-right">
                                                {m}
                                            </th>
                                        ))}
                                        <th className="px-3 py-2.5 text-right">{ano}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linhas.map((l) => {
                                        const tot = l.prov.reduce((s, v) => s + v, 0);
                                        return (
                                            <tr key={l.n.id} className={`border-t border-[#E3E8F0] dark:border-white/[0.08] ${l.folha ? '' : 'bg-[#FAFBFD] font-extrabold dark:bg-white/[0.03]'}`}>
                                                <td className={`sticky left-0 z-[1] bg-inherit px-3 py-1.5 ${l.folha ? 'bg-white dark:bg-[#232B3F]' : 'bg-[#FAFBFD] dark:bg-[#262F44]'}`} style={{ paddingLeft: 12 + l.nivel * 12 }}>
                                                    <span className="text-[#5B6478] dark:text-[#AEB9CF]">{l.n.codigo}</span> <span className="break-words">{l.n.nome}</span>
                                                </td>
                                                {M12.map((m, i) => {
                                                    const v = l.prov[i];
                                                    const div = !filtro && !!d.divididas[String(l.n.id)]?.[String(m)];
                                                    return (
                                                        <td key={m} className="px-1 py-1 text-right">
                                                            {l.folha ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCel({ n: l.n, m, valor: v })}
                                                                    className={`min-h-9 w-full rounded-lg px-1.5 text-right hover:bg-[#E9EFF6] dark:hover:bg-[#3D6A99]/20 ${v ? '' : 'text-[#B8C0CE]'}`}
                                                                    aria-label={`${l.n.nome} · ${MESES[i]}`}
                                                                >
                                                                    {num(v) || '·'}
                                                                    {div ? '*' : ''}
                                                                </button>
                                                            ) : (
                                                                <span className="px-1.5">{num(v)}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-3 py-1.5 text-right font-extrabold">{num(tot)}</td>
                                            </tr>
                                        );
                                    })}
                                    {resultado ? (
                                        <tr className="border-t-2 border-[#313C55] bg-[#E9EFF6] font-extrabold dark:border-white/40 dark:bg-[#3D6A99]/20">
                                            <td className="sticky left-0 z-[1] bg-[#E9EFF6] px-3 py-2.5 dark:bg-[#2B3B57]">Resultado previsto</td>
                                            {resultado.map((v, i) => (
                                                <td key={i} className={`px-2 py-2.5 text-right ${v < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>
                                                    {num(v) || '0'}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2.5 text-right">{num(resultado.reduce((s, v) => s + v, 0)) || '0'}</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className={SUB}>Resultado previsto = receitas − deduções, custos e despesas (as entradas e saídas não operacionais ficam fora).</div>
                </>
            ) : null}
            {cel && d ? (
                <EditarCelula
                    ano={ano}
                    filtro={filtro}
                    cel={cel}
                    dividida={!filtro && !!d.divididas[String(cel.n.id)]?.[String(cel.m)]}
                    onFechar={() => setCel(null)}
                    feito={async (m) => {
                        setCel(null);
                        avisar(m);
                        await carregar();
                    }}
                />
            ) : null}
        </div>
    );
}

function EditarCelula({ ano, filtro, cel, dividida, onFechar, feito }: { ano: number; filtro: string; cel: { n: Nat; m: number; valor: number }; dividida: boolean; onFechar: () => void; feito: (m: string) => void }) {
    const [valor, setValor] = useState(cel.valor ? cel.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const gravar = async (repetir: boolean) => {
        const v = valor.trim() ? paraNumero(valor) : 0;
        if (v === null || Number.isNaN(v) || v < 0) return setErro('Valor inválido.');
        const meses = repetir ? M12.filter((m) => m >= cel.m) : [cel.m];
        setOcupado(true);
        try {
            const j = await api(URL_PROVISAO, 'gravar', { ano, filtro, celulas: meses.map((m) => ({ natureza_id: cel.n.id, mes: m, valor: v })) });
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível gravar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    return (
        <Janela
            titulo={`${cel.n.codigo} ${cel.n.nome}`}
            sub={`${MESES[cel.m - 1]}/${ano}`}
            onFechar={onFechar}
            largura="max-w-md"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    {cel.m < 12 ? (
                        <button type="button" className={BTN_SEC} disabled={ocupado || dividida} onClick={() => void gravar(true)}>
                            Repetir no ano
                        </button>
                    ) : null}
                    <button type="button" className={BTN_PRI} disabled={ocupado || dividida} onClick={() => void gravar(false)}>
                        Gravar
                    </button>
                </>
            }
        >
            {dividida ? (
                <div className={NOTA}>
                    <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>A meta deste mês está dividida por área, local ou veículo (soma {brl(cel.valor)}). Mude na aba Mês ou escolha a área ou o local no filtro.</span>
                </div>
            ) : (
                <>
                    <label>
                        <span className={ROTULO}>Provisão do mês</span>
                        <input className={CAMPO} inputMode="decimal" autoFocus placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
                    </label>
                    <p className={SUB}>Vazio ou zero tira a meta. "Repetir no ano" grava este valor de {MESES[cel.m - 1]} a dez.</p>
                </>
            )}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== Orçado × realizado ============================== */

export function OrcadoRealizado() {
    const [ano, setAno] = useState(new Date().getFullYear());
    const [filtro, setFiltro] = useState('');
    const { d, erro, carregar, arvore } = useAno(ano, filtro);

    const ateMes = useMemo(() => {
        if (!d) return 0;
        const [a, m] = d.mes_atual.split('-').map(Number);
        return ano < a ? 12 : ano > a ? 0 : m;
    }, [d, ano]);

    const linhas = useMemo(() => {
        if (!d || !arvore) return [];
        return montarLinhas(d, arvore, false).map((l) => {
            const orc = l.prov.slice(0, ateMes).reduce((s, v) => s + v, 0);
            const real = l.real.slice(0, ateMes).reduce((s, v) => s + v, 0);
            const c = l.folha ? arvore.classe(l.n) : null;
            return { ...l, orc, realAte: real, anoTot: l.prov.reduce((s, v) => s + v, 0), pct: orc > 0 ? (real / orc) * 100 : null, receita: c === 'RECEITA' };
        });
    }, [d, arvore, ateMes]);
    const estouradas = linhas.filter((l) => l.folha && !l.receita && l.pct !== null && l.pct > 100).length;

    return (
        <div className="flex flex-col gap-3">
            <div className={`${CARTAO} flex flex-wrap items-end gap-3 p-3.5`}>
                <label className="w-[110px]">
                    <span className={ROTULO}>Ano</span>
                    <SeletorAno ano={ano} onChange={setAno} />
                </label>
                <label className="min-w-[200px] flex-1 sm:flex-none">
                    <span className={ROTULO}>Área e local</span>
                    <FiltroArea d={d} valor={filtro} onChange={setFiltro} />
                </label>
                <button type="button" className={BTN_SEC} onClick={() => void carregar()} aria-label="Atualizar">
                    <IconRefresh size={18} />
                </button>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {!d && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
            {d && ateMes === 0 ? <div className={NOTA}>{ano} ainda não começou: não há realizado para comparar.</div> : null}
            {d && ateMes > 0 ? (
                <>
                    <div className={SUB}>
                        De janeiro a {MESES[ateMes - 1]}/{ano}, por competência (como na DRE).{' '}
                        {estouradas ? (
                            <b className="text-[#B42318] dark:text-[#FF9C92]">
                                {estouradas} natureza(s) acima do previsto.
                            </b>
                        ) : null}
                    </div>
                    {linhas.length === 0 ? (
                        <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Sem provisão nem realizado no período.</div>
                    ) : (
                        <div className={`${CARTAO} overflow-x-auto`}>
                            <table className="w-full min-w-[760px] border-collapse text-[13.5px] tabular-nums">
                                <thead>
                                    <tr className="bg-[#F6F8FB] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                        <th className="px-3 py-2.5 text-left">Natureza</th>
                                        <th className="px-3 py-2.5 text-right">Orçado até {MESES[ateMes - 1]}</th>
                                        <th className="px-3 py-2.5 text-right">Realizado</th>
                                        <th className="w-[220px] px-3 py-2.5 text-left">Usado</th>
                                        <th className="px-3 py-2.5 text-right">Orçado no ano</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linhas.map((l) => {
                                        const alerta = l.folha && !l.receita && l.pct !== null && l.pct > 100;
                                        const larg = l.pct === null ? 0 : Math.min(100, l.pct);
                                        return (
                                            <tr key={l.n.id} className={`border-t border-[#E3E8F0] dark:border-white/[0.08] ${l.folha ? '' : 'bg-[#FAFBFD] font-extrabold dark:bg-white/[0.03]'}`}>
                                                <td className="px-3 py-2" style={{ paddingLeft: 12 + l.nivel * 12 }}>
                                                    <span className="text-[#5B6478] dark:text-[#AEB9CF]">{l.n.codigo}</span> <span className="break-words">{l.n.nome}</span>
                                                </td>
                                                <td className="px-3 py-2 text-right">{brl(l.orc)}</td>
                                                <td className="px-3 py-2 text-right">{brl(l.realAte)}</td>
                                                <td className="px-3 py-2">
                                                    {l.folha && l.pct !== null ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E3E8F0] dark:bg-white/[0.1]">
                                                                <div className={`h-full rounded-full ${alerta ? 'bg-[#E5484D]' : l.receita ? 'bg-[#B3CE52]' : 'bg-[#3D6A99]'}`} style={{ width: `${larg}%` }} />
                                                            </div>
                                                            <span className={`w-[52px] text-right font-extrabold ${alerta ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{Math.round(l.pct)}%</span>
                                                        </div>
                                                    ) : l.folha ? (
                                                        <span className={SUB}>sem provisão</span>
                                                    ) : null}
                                                </td>
                                                <td className="px-3 py-2 text-right">{brl(l.anoTot)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className={SUB}>Despesa acima de 100% fica em alerta. Na receita, a barra mostra quanto da meta já entrou.</div>
                </>
            ) : null}
        </div>
    );
}

