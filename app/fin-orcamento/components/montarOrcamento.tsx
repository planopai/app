'use client';

/**
 * Montar o orçamento do ano — 18/11/2026 (prévia aprovada em 18/11/2026). Back-end: fin_provisao.php (montar, premissas, aplicar).
 *
 * Substitui o "Gerar" que repetia o ano passado: cada natureza é orçada pelo método que faz sentido para ela
 * (motores para mensalidades e OS, valor atual + reajuste no mês certo para custos fixos, % da receita para variáveis,
 * calendário dos últimos 12 meses para IPVA, IPTU e férias, valor anual para investimentos). A base são os últimos 12 meses
 * fechados (com a regra da virada), sem os picos marcados. Parâmetros, o valor do ano e cada mês são editáveis.
 * Premissas, métodos e ajustes ficam salvos em fin_parametro (orcamento_premissas_AAAA). Aplicar grava em fin_orcamento sem
 * área/local (substituindo o ano ou só nas células vazias). A conta é feita aqui na tela; o PHP só grava.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconDeviceFloppy, IconInfoCircle, IconRotate } from '@tabler/icons-react';
import { api, BTN_PRI, BTN_SEC, CARTAO, ERRO, Janela, mensagemErro, NOTA, paraNumero, S_AB, S_AVISO, S_OK, SELO, SUB } from '../../contas-pagar/components/fin';
const URL_PROVISAO = 'https://api.planoassistencialintegrado.com.br/fin_provisao.php';

/* ============================== tipos ============================== */

type Nat = { id: number; codigo: string; pai: string | null; nome: string; grupo: boolean; classe: string | null; ativo: boolean };
type Pico = { natureza_id: number; mes: string; i: number; valor: number; vezes: number };
type Dados = {
    ano: number;
    de: string;
    ate: string;
    ultimos3: string[];
    naturezas: Nat[];
    base: Record<string, number[]>;
    picos: Pico[];
    mensalidade: number | null;
    os: number | null;
    prefeitura: number | null;
    salvo: Salvo | null;
    metas: number;
};
type Metodo = 'mens' | 'os' | 'tend' | 'pct' | 'reaj' | 'cal' | 'anual' | 'fixomes' | 'fora';
type Cfg = {
    m: Metodo;
    p?: number; // % (tend, pct, reaj, cal) ou R$ (anual = valor do ano; fixomes = por mês)
    ref?: 'os' | 'rec';
    mes?: number; // 0..11
    ri?: 'ipca' | 'dis' | 'alu';
    dist?: '12' | 'mes' | 'parc' | 'esc';
    np?: number;
    esc?: number[];
    d13?: boolean;
    ov?: number | null; // valor do ano digitado
    mm?: (number | null)[] | null; // meses digitados
};
type Prem = {
    cen: 'pes' | 'base' | 'oti';
    assoc: number;
    ticket: number;
    novos: number;
    canc: number;
    reajM: number;
    mesM: number;
    atend: number;
    tOS: number;
    saz: boolean;
    ipca: number;
    dis: number;
    mesD: number;
    alu: number;
    mesA: number;
};
type Salvo = { prem?: Partial<Prem>; cfg?: Record<string, Cfg>; picosFora?: string[]; vazias?: boolean };
type Sec = 'R' | 'D' | 'V' | 'F' | 'X' | 'N' | 'I';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const Z = () => Array(12).fill(0) as number[];
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const n0 = (v: number) => (Math.abs(v) < 0.5 ? '—' : `${v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`);
const mil = (v: number) => {
    const a = Math.abs(v);
    return `${v < 0 ? '−' : ''}${a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : a >= 1000 ? `${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};
const pctTxt = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}%`;
const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

const SECOES: { id: Sec; nome: string; t: 'e' | 's' | 'i' }[] = [
    { id: 'R', nome: 'Receitas', t: 'e' },
    { id: 'D', nome: '(−) Deduções', t: 's' },
    { id: 'V', nome: '(−) Custos variáveis', t: 's' },
    { id: 'F', nome: '(−) Custos fixos', t: 's' },
    { id: 'X', nome: '(−) Despesas operacionais', t: 's' },
    { id: 'N', nome: '(+) Entradas não operacionais', t: 'e' },
    { id: 'I', nome: '(−) Investimentos, empréstimos e retiradas', t: 'i' },
];

const METODOS: Record<Metodo, [string, string]> = {
    mens: ['Motor: associados × mensalidade', 'Associados de cada mês (os de hoje + novos − cancelamentos) × mensalidade média, com o reajuste a partir do mês escolhido nas premissas. Sem o número de associados, usa o valor de hoje com o reajuste.'],
    os: ['Motor: atendimentos × ticket', 'Atendimentos por mês × ticket médio, com a sazonalidade dos últimos 12 meses. Sem o número de atendimentos, usa a média dos 12 meses com a sazonalidade.'],
    tend: ['Tendência', 'Média mensal dos últimos 12 meses (sem os picos) crescendo o % do ano aos poucos, mês a mês.'],
    pct: ['% da receita', 'Uma porcentagem da receita total ou só dos serviços funerários (grupo 1.2), mês a mês. Se a receita mudar, acompanha sozinho. Para custos variáveis e o Simples.'],
    reaj: ['Valor atual + reajuste', 'Parte do valor de hoje (média dos últimos 3 meses fechados, sem picos) e aplica o reajuste a partir do mês dele: dissídio na folha, IGP-M no aluguel, IPCA no resto. Nos salários, a opção +13º soma meio salário em novembro e meio em dezembro.'],
    cal: ['Calendário (últimos 12 meses)', 'Repete cada mês dos últimos 12 meses no mesmo mês do ano, com o reajuste. Para o que cai em meses certos: IPVA, licenciamento, IPTU, férias.'],
    anual: ['Valor anual', 'Você define o valor do ano e como ele cai: em 12 partes iguais, tudo num mês, em parcelas a partir de um mês ou nos meses marcados. Para investimentos e despesas anuais sem histórico.'],
    fixomes: ['Valor fixo por mês', 'O mesmo valor todo mês. Para contratos (Prefeitura, parcelas de empréstimo) ou quando já se sabe o valor.'],
    fora: ['Fora do orçamento', 'Não entra no ano (ajustes de saldo, saídas não identificadas, transferências).'],
};

const PREM0: Prem = { cen: 'base', assoc: 0, ticket: 0, novos: 0, canc: 0, reajM: 0, mesM: 0, atend: 0, tOS: 0, saz: true, ipca: 4.5, dis: 6, mesD: 4, alu: 4, mesA: 0 };

/** Campo de número que só grava ao sair (ou Enter), aceitando 1.234,56. */
function NumIn({ v, onSet, w = 'w-[84px]', dest = false, rot }: { v: number; onSet: (n: number) => void; w?: string; dest?: boolean; rot?: string }) {
    const fmt = (x: number) => (Number.isFinite(x) ? (Math.round(x * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '');
    const [t, setT] = useState(fmt(v));
    useEffect(() => setT(fmt(v)), [v]);
    const ok = () => {
        const n = paraNumero(t);
        const x = n === null ? 0 : n;
        if (Number.isNaN(x)) setT(fmt(v));
        else if (Math.abs(x - v) >= 0.005) onSet(x); // só grava se mudou (sair do campo sem mexer não marca "ajustado à mão")
    };
    return (
        <input
            aria-label={rot}
            inputMode="decimal"
            className={`h-8 ${w} rounded-lg border bg-[#F1F4F8] px-2 text-right text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] ${dest ? 'border-[#E0B400]' : 'border-transparent'}`}
            value={t}
            onChange={(e) => setT(e.target.value)}
            onBlur={ok}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
        />
    );
}
const SelMes = ({ v, onSet }: { v: number; onSet: (n: number) => void }) => (
    <select className="h-8 rounded-lg bg-[#F1F4F8] px-1.5 text-[13px] dark:bg-[#1C2334]" value={v} onChange={(e) => onSet(Number(e.target.value))}>
        {MESES.map((m, i) => (
            <option key={m} value={i}>
                {m}
            </option>
        ))}
    </select>
);

/* ============================== tela ============================== */

export function MontarOrcamento({ ano, onFechar, feito }: { ano: number; onFechar: () => void; feito: (m: string) => void }) {
    const [d, setD] = useState<Dados | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [prem, setPrem] = useState<Prem>(PREM0);
    const [cfg, setCfg] = useState<Record<string, Cfg>>({});
    const [picosFora, setPicosFora] = useState<Record<string, boolean>>({});
    const [ab, setAb] = useState<Record<string, boolean>>({ R: true, D: true, V: true, F: true, X: true, N: true, I: true });
    const [abM, setAbM] = useState<Record<number, boolean>>({});
    const [info, setInfo] = useState(false);
    const [todas, setTodas] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [confirma, setConfirma] = useState(false);

    /* ---------- base ---------- */
    const porCod = useMemo(() => new Map((d?.naturezas ?? []).map((n) => [n.codigo, n])), [d]);
    const classe = useCallback(
        (n: Nat): string | null => {
            let x: Nat | undefined = n;
            let g = 0;
            while (x && g++ < 6) {
                if (x.classe) return x.classe;
                x = x.pai ? porCod.get(x.pai) : undefined;
            }
            return null;
        },
        [porCod],
    );
    const secDe = useCallback(
        (n: Nat): Sec => {
            const c = classe(n);
            if (c === 'RECEITA') return 'R';
            if (c === 'DEDUCAO') return 'D';
            if (c === 'CUSTO_VARIAVEL') return 'V';
            if (c === 'CUSTO_FIXO') return 'F';
            if (c === 'NAO_OPERACIONAL') return n.codigo.startsWith('4') ? 'N' : 'I';
            return 'X';
        },
        [classe],
    );
    const folhas = useMemo(() => (d ? d.naturezas.filter((n) => !n.grupo && n.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })) : []), [d]);
    const chavePico = (p: { natureza_id: number; mes: string }) => `${p.natureza_id}|${p.mes}`;
    // meses dos últimos 12 (por mês do calendário) sem os picos marcados
    const limpo = useCallback(
        (id: number) => {
            const m = [...(d?.base[String(id)] ?? Z())];
            d?.picos.forEach((p) => {
                if (p.natureza_id === id && picosFora[chavePico(p)]) m[p.i] = 0;
            });
            return m;
        },
        [d, picosFora],
    );
    const nPicos = useCallback((id: number) => (d?.picos ?? []).filter((p) => p.natureza_id === id && picosFora[chavePico(p)]).length, [d, picosFora]);
    const media = useCallback((id: number) => soma(limpo(id)) / Math.max(1, 12 - nPicos(id)), [limpo, nPicos]);
    const u3 = useCallback(
        (id: number) => {
            if (!d) return 0;
            const m = limpo(id);
            const idx = d.ultimos3.map((x) => Number(x.slice(5, 7)) - 1).filter((i) => !(d.picos ?? []).some((p) => p.natureza_id === id && p.i === i && picosFora[chavePico(p)]));
            return idx.length ? soma(idx.map((i) => m[i])) / idx.length : media(id);
        },
        [d, limpo, media, picosFora],
    );
    const tot12 = useCallback((id: number) => soma(d?.base[String(id)] ?? Z()), [d]);
    const ehCalendario = useCallback((id: number) => {
        const m = d?.base[String(id)] ?? Z();
        const com = m.filter((v) => Math.abs(v) >= 0.01).length;
        return com >= 1 && com <= 4 && soma(m) >= 500;
    }, [d]);

    /* ---------- métodos sugeridos ---------- */
    const sugerido = useCallback(
        (n: Nat, recServ12: number, rec12: number): Cfg => {
            const s = secDe(n);
            const nome = n.nome.toLowerCase();
            if (s === 'R') {
                if (n.id === d?.mensalidade) return { m: 'mens' };
                if (n.id === d?.os) return { m: 'os' };
                if (n.id === d?.prefeitura) return { m: 'fixomes', p: Math.round(u3(n.id)) };
                return { m: 'tend', p: 0 };
            }
            if (s === 'D') return { m: 'pct', ref: 'rec', p: rec12 ? Math.round((tot12(n.id) / rec12) * 1000) / 10 : 0 };
            if (s === 'V') return { m: 'pct', ref: 'os', p: recServ12 ? Math.round((tot12(n.id) / recServ12) * 1000) / 10 : 0 };
            if (s === 'N') return /ajuste|n[aã]o identificad|transfer/.test(nome) ? { m: 'fora' } : { m: 'tend', p: 0 };
            if (s === 'I') {
                if (/n[aã]o identificad|transfer|ajuste/.test(nome)) return { m: 'fora' };
                if (/amortiza|empr[eé]stimo|financiamento|cons[oó]rcio/.test(nome)) return { m: 'fixomes', p: Math.round(u3(n.id)) };
                return { m: 'anual', p: 0, dist: '12' };
            }
            if (ehCalendario(n.id)) return { m: 'cal', ri: 'ipca' };
            const ri = n.codigo.startsWith('3.1.') ? 'dis' : /aluguel/.test(nome) ? 'alu' : 'ipca';
            return { m: 'reaj', ri, d13: /sal[aá]rio/.test(nome) && !/adiantamento/.test(nome) ? true : undefined };
        },
        [d, secDe, u3, tot12, ehCalendario],
    );

    /* ---------- carregar ---------- */
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_PROVISAO, 'montar', undefined, `&ano=${ano}`);
                const dd: Dados = j.dados;
                setD(dd);
                const sv = dd.salvo;
                const pf: Record<string, boolean> = {};
                if (sv?.picosFora) sv.picosFora.forEach((k) => (pf[k] = true));
                else dd.picos.forEach((p) => (pf[chavePico(p)] = true));
                setPicosFora(pf);
                if (sv?.prem) setPrem({ ...PREM0, ...sv.prem });
                if (sv?.cfg) setCfg(sv.cfg);
                setErro(null);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar a base do orçamento.');
                if (m) setErro(m);
            }
        })();
    }, [ano]);

    /* ---------- conta ---------- */
    const calc = useMemo(() => {
        if (!d) return null;
        const vol = prem.cen === 'pes' ? 0.95 : prem.cen === 'oti' ? 1.05 : 1;
        const recServ12 = soma(folhas.filter((n) => secDe(n) === 'R' && n.codigo.startsWith('1.2.')).map((n) => tot12(n.id)));
        const rec12 = soma(folhas.filter((n) => secDe(n) === 'R').map((n) => tot12(n.id)));
        const c = (n: Nat): Cfg => ({ ...sugerido(n, recServ12, rec12), ...(cfg[String(n.id)] ?? {}) });
        // associados mês a mês
        const assoc: number[] = [];
        let a = prem.assoc;
        for (let m = 0; m < 12; m++) {
            a = a + prem.novos * vol - a * (prem.canc / 100);
            assoc.push(a);
        }
        const serie: Record<number, number[]> = {};
        const calcd: Record<number, number[]> = {};
        const rec = Z(),
            serv = Z();
        const reajDe = (n: Nat, k: Cfg) => {
            const ri = k.ri || 'ipca';
            const dflt = ri === 'dis' ? { p: prem.dis, mes: prem.mesD } : ri === 'alu' ? { p: prem.alu, mes: prem.mesA } : { p: prem.ipca, mes: 0 };
            return { p: k.p ?? dflt.p, mes: k.m === 'reaj' && k.mes !== undefined ? k.mes : dflt.mes };
        };
        const ordem = SECOES.flatMap((s) => folhas.filter((n) => secDe(n) === s.id));
        ordem.forEach((n) => {
            const k = c(n);
            const s = secDe(n);
            let v = Z();
            if (k.m === 'mens') {
                const tk = prem.ticket || (prem.assoc ? u3(n.id) / prem.assoc : 0);
                v = prem.assoc > 0 ? v.map((_, m) => assoc[m] * tk * (m >= prem.mesM ? 1 + prem.reajM / 100 : 1)) : v.map((_, m) => u3(n.id) * (m >= prem.mesM ? 1 + prem.reajM / 100 : 1));
            } else if (k.m === 'os') {
                const l = limpo(n.id);
                const med = media(n.id);
                const saz = (m: number) => (prem.saz && med > 0 && l[m] > 0 ? l[m] / med : 1);
                const tk = prem.tOS || (prem.atend ? med / prem.atend : 0);
                v = prem.atend > 0 ? v.map((_, m) => prem.atend * vol * tk * saz(m)) : v.map((_, m) => med * vol * saz(m));
            } else if (k.m === 'tend') v = v.map((_, m) => media(n.id) * Math.pow(1 + (k.p || 0) / 100, (m + 1) / 12) * (s === 'R' ? vol : 1));
            else if (k.m === 'reaj') {
                const r = reajDe(n, k);
                v = v.map((_, m) => u3(n.id) * (m >= r.mes ? 1 + r.p / 100 : 1));
                if (k.d13) {
                    v[10] += v[10] / 2;
                    v[11] += v[11] / 2;
                }
            } else if (k.m === 'cal') {
                const r = reajDe(n, k);
                v = limpo(n.id).map((x) => x * (1 + r.p / 100));
            } else if (k.m === 'anual') {
                const t = k.p || 0;
                if (k.dist === 'mes') v[k.mes || 0] = t;
                else if (k.dist === 'parc') {
                    const q = Math.max(1, Math.round(k.np || 1));
                    for (let i = 0; i < q; i++) v[((k.mes || 0) + i) % 12] += t / q;
                } else if (k.dist === 'esc') {
                    const e = k.esc?.length ? k.esc : [0];
                    e.forEach((m) => (v[m] += t / e.length));
                } else v = v.map(() => t / 12);
            } else if (k.m === 'fixomes') v = v.map(() => k.p || 0);
            // pct depois das receitas (a ordem das seções garante)
            if (k.m === 'pct') v = (k.ref === 'os' ? serv : rec).map((x) => x * ((k.p || 0) / 100));
            calcd[n.id] = v;
            if (k.ov != null) {
                const t = soma(v);
                v = t > 0.5 ? v.map((x) => (x * (k.ov as number)) / t) : v.map(() => (k.ov as number) / 12);
            }
            if (k.mm) v = v.map((x, m) => (k.mm![m] != null ? (k.mm![m] as number) : x));
            v = v.map((x) => Math.max(0, x));
            serie[n.id] = v;
            if (s === 'R') {
                v.forEach((x, m) => {
                    rec[m] += x;
                    if (n.codigo.startsWith('1.2.')) serv[m] += x;
                });
            }
        });
        const sec = (id: Sec) => {
            const v = Z();
            folhas.filter((n) => secDe(n) === id).forEach((n) => serie[n.id].forEach((x, m) => (v[m] += x)));
            return v;
        };
        const R = sec('R'),
            S = Z(),
            N = sec('N'),
            I = sec('I');
        (['D', 'V', 'F', 'X'] as Sec[]).forEach((id) => sec(id).forEach((x, m) => (S[m] += x)));
        const RO = R.map((r, m) => r - S[m]);
        const SA = RO.map((r, m) => r + N[m] - I[m]);
        return { c, serie, calcd, assoc, R, S, N, I, RO, SA, reajDe };
    }, [d, prem, cfg, folhas, secDe, tot12, sugerido, u3, limpo, media]);

    const muda = (id: number, k: Partial<Cfg>) => setCfg((o) => ({ ...o, [String(id)]: { ...(calc ? calc.c(folhas.find((n) => n.id === id)!) : { m: 'fora' }), ...(o[String(id)] ?? {}), ...k } as Cfg }));
    const dadosSalvar = (): Salvo => ({ prem, cfg, picosFora: Object.keys(picosFora).filter((k) => picosFora[k]) });

    const salvar = async () => {
        setOcupado(true);
        try {
            const j = await api(URL_PROVISAO, 'premissas', { ano, dados: dadosSalvar() });
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const aplicar = async (modo: 'substituir' | 'vazias') => {
        if (!calc) return;
        setOcupado(true);
        try {
            const metas = folhas.filter((n) => soma(calc.serie[n.id]) >= 0.01).map((n) => ({ natureza_id: n.id, valores: calc.serie[n.id].map((x) => Math.round(x * 100) / 100) }));
            const j = await api(URL_PROVISAO, 'aplicar', { ano, modo, metas, dados: dadosSalvar() });
            feito(j.msg);
            onFechar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível aplicar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    const P = (k: keyof Prem) => (n: number) => setPrem((o) => ({ ...o, [k]: n }));
    const natPorId = useMemo(() => new Map(folhas.map((n) => [n.id, n])), [folhas]);
    const nomeGrupo = (g: string) => porCod.get(g)?.nome || g;
    const visivel = (n: Nat) => todas || tot12(n.id) >= 0.01 || (calc && soma(calc.serie[n.id]) >= 0.01) || !!cfg[String(n.id)];
    const calendario = folhas.filter((n) => ehCalendario(n.id) && secDe(n) !== 'I' && secDe(n) !== 'N');

    const rodape = (
        <>
            <button type="button" className={BTN_SEC} onClick={onFechar}>
                Fechar
            </button>
            <button type="button" className={BTN_SEC} disabled={ocupado || !calc} onClick={() => void salvar()}>
                <IconDeviceFloppy size={18} /> Salvar premissas
            </button>
            <button type="button" className={BTN_SEC} disabled={ocupado || !calc} onClick={() => void aplicar('vazias')}>
                Só nas células vazias
            </button>
            {confirma ? (
                <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void aplicar('substituir')}>
                    Confirmar: apagar e gravar {ano}
                </button>
            ) : (
                <button type="button" className={BTN_PRI} disabled={ocupado || !calc} onClick={() => (d?.metas ? setConfirma(true) : void aplicar('substituir'))}>
                    Aplicar e substituir {ano}
                </button>
            )}
        </>
    );

    return (
        <Janela titulo={`Montar o orçamento ${ano}`} sub={d ? `Base: últimos 12 meses fechados (${mesCurto(d.de)} a ${mesCurto(d.ate)}), com a referência da virada` : 'Carregando…'} largura="max-w-[1380px]" onFechar={onFechar} rodape={rodape}>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {confirma ? (
                <div className={`${NOTA} ${S_AVISO}`}>
                    <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>
                        {ano} já tem {d?.metas} meta(s) na grade. Substituir apaga todas (inclusive as divididas por área, local ou veículo) e grava as deste orçamento. Para manter o que foi digitado, use “Só nas células vazias”.
                    </span>
                </div>
            ) : null}
            {!d && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
            {d && calc ? (
                <>
                    {/* 1 · premissas */}
                    <Titulo n={1} t="Premissas do ano" />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={SUB}>Cenário:</span>
                        {(
                            [
                                ['pes', 'Pessimista'],
                                ['base', 'Base'],
                                ['oti', 'Otimista'],
                            ] as const
                        ).map(([k, r]) => (
                            <button key={k} type="button" onClick={() => setPrem({ ...prem, cen: k })} className={`h-9 rounded-xl px-3.5 text-[13.5px] font-extrabold ${prem.cen === k ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border border-[#C9D1DE] dark:border-white/[0.2]'}`}>
                                {r}
                            </button>
                        ))}
                        <span className={SUB}>{prem.cen === 'base' ? 'volumes como nas premissas' : prem.cen === 'pes' ? '5% menos associados novos, atendimentos e receitas de tendência' : '5% mais associados novos, atendimentos e receitas de tendência'}</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                        <Cartao t="Mensalidades" s="Associados × mensalidade média, com entradas e saídas.">
                            <Campo r="Associados ativos hoje">
                                <NumIn v={prem.assoc} onSet={P('assoc')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Mensalidade média (R$)">
                                <NumIn v={prem.ticket || (prem.assoc && d.mensalidade ? u3(d.mensalidade) / prem.assoc : 0)} onSet={P('ticket')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Novos por mês">
                                <NumIn v={prem.novos} onSet={P('novos')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Cancelamentos por mês (%)">
                                <NumIn v={prem.canc} onSet={P('canc')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Reajuste da mensalidade (%)">
                                <NumIn v={prem.reajM} onSet={P('reajM')} w="w-[110px]" />
                            </Campo>
                            <Campo r="A partir de">
                                <SelMes v={prem.mesM} onSet={P('mesM')} />
                            </Campo>
                            <div className={`${SUB} border-t border-[#E3E8F0] pt-2 dark:border-white/[0.08]`}>
                                {prem.assoc ? (
                                    <>
                                        Dez: <b>{Math.round(calc.assoc[11]).toLocaleString('pt-BR')}</b> associados ·{' '}
                                    </>
                                ) : (
                                    'Sem os associados, usa o valor de hoje. '
                                )}
                                mensalidades no ano <b>R$ {mil(d.mensalidade ? soma(calc.serie[d.mensalidade] ?? Z()) : 0)}</b>
                            </div>
                        </Cartao>
                        <Cartao t="Atendimentos (OS)" s="Atendimentos por mês × ticket médio, com a sazonalidade dos últimos 12 meses.">
                            <Campo r="Atendimentos particulares/mês">
                                <NumIn v={prem.atend} onSet={P('atend')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Ticket médio da OS (R$)">
                                <NumIn v={prem.tOS || (prem.atend && d.os ? media(d.os) / prem.atend : 0)} onSet={P('tOS')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Usar sazonalidade">
                                <select className="h-8 rounded-lg bg-[#F1F4F8] px-1.5 text-[13px] dark:bg-[#1C2334]" value={prem.saz ? '1' : '0'} onChange={(e) => setPrem({ ...prem, saz: e.target.value === '1' })}>
                                    <option value="1">Sim</option>
                                    <option value="0">Não</option>
                                </select>
                            </Campo>
                            <div className={`${SUB} border-t border-[#E3E8F0] pt-2 dark:border-white/[0.08]`}>
                                {prem.atend ? `${Math.round(prem.atend * 12)} atendimentos no ano · ` : 'Sem os atendimentos, usa a média dos 12 meses. '}
                                OS no ano <b>R$ {mil(d.os ? soma(calc.serie[d.os] ?? Z()) : 0)}</b>
                            </div>
                        </Cartao>
                        <Cartao t="Reajustes padrão" s="Viram o parâmetro sugerido de cada natureza (dá para mudar linha a linha).">
                            <Campo r="Inflação geral (IPCA) %">
                                <NumIn v={prem.ipca} onSet={P('ipca')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Dissídio da folha %">
                                <NumIn v={prem.dis} onSet={P('dis')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Mês do dissídio">
                                <SelMes v={prem.mesD} onSet={P('mesD')} />
                            </Campo>
                            <Campo r="Aluguel (IGP-M) %">
                                <NumIn v={prem.alu} onSet={P('alu')} w="w-[110px]" />
                            </Campo>
                            <Campo r="Mês do reajuste do aluguel">
                                <SelMes v={prem.mesA} onSet={P('mesA')} />
                            </Campo>
                        </Cartao>
                    </div>

                    {/* 2 · o que os 12 meses mostraram */}
                    <Titulo n={2} t="O que os últimos 12 meses mostraram" />
                    <div className={`${CARTAO} p-3.5`}>
                        <b>Picos que não se repetem</b>
                        <div className={SUB}>Mês acima de 3× a mediana da natureza. Marcados ficam fora da base (não viram meta).</div>
                        {d.picos.length ? (
                            d.picos.map((p) => {
                                const n = natPorId.get(p.natureza_id);
                                const k = chavePico(p);
                                return (
                                    <label key={k} className="flex items-center gap-3 border-t border-dashed border-[#E3E8F0] py-2 text-[14px] first-of-type:border-t-0 dark:border-white/[0.1]">
                                        <input type="checkbox" className="size-[18px] accent-[#313C55]" checked={!!picosFora[k]} onChange={(e) => setPicosFora({ ...picosFora, [k]: e.target.checked })} />
                                        <span className="min-w-0 flex-1">
                                            <span className="mr-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{n?.codigo}</span>
                                            {n?.nome} · {mesCurto(p.mes)} <span className={SUB}>({p.vezes.toLocaleString('pt-BR')}× a mediana)</span>
                                        </span>
                                        <b className="tabular-nums">R$ {mil(p.valor)}</b>
                                        <span className={`${SELO} ${picosFora[k] ? S_AVISO : S_OK}`}>{picosFora[k] ? 'fora da base' : 'fica na base'}</span>
                                    </label>
                                );
                            })
                        ) : (
                            <div className={`${SUB} mt-1`}>Nenhum pico encontrado.</div>
                        )}
                    </div>
                    {calendario.length ? (
                        <div className={`${CARTAO} p-3.5`}>
                            <b>Despesas de calendário (caem em meses certos)</b>
                            <div className={SUB}>Naturezas com valor em até 4 dos 12 meses. Vão com o método Calendário: repetem no mesmo mês. Para mudar o mês, abra a natureza na tabela e digite no mês certo.</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {calendario.map((n) => (
                                    <div key={n.id} className="rounded-xl bg-[#F6F8FB] px-3 py-2 text-[13.5px] dark:bg-[#1C2334]">
                                        <b>{n.nome}</b>
                                        <div className={SUB}>
                                            <span className="mr-1">{n.codigo}</span>
                                            {(d.base[String(n.id)] ?? Z())
                                                .map((v, i) => (v >= 0.01 ? `${MESES[i]} R$ ${mil(v)}` : ''))
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* 3 · por natureza */}
                    <Titulo n={3} t="Orçamento por natureza" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
                        <button type="button" className="font-extrabold hover:underline" onClick={() => setAb(Object.fromEntries([...SECOES.map((s) => s.id), ...folhas.map((n) => secDe(n) + n.codigo.split('.').slice(0, 2).join('.'))].map((k) => [k, true])))}>
                            Abrir tudo
                        </button>
                        <button type="button" className="font-extrabold hover:underline" onClick={() => setAb({})}>
                            Fechar tudo
                        </button>
                        <label className="flex items-center gap-2 font-bold">
                            <input type="checkbox" className="size-[18px] accent-[#313C55]" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar naturezas sem valor
                        </label>
                        <span className={`${SUB} flex gap-3`}>
                            <Leg c="#8FAE4A" t="Entradas" />
                            <Leg c="#C7685E" t="Saídas" />
                            <Leg c="#3D6A99" t="Investimentos" />
                        </span>
                        <span className="flex-1" />
                        <span className={SUB}>Toque no nome da natureza para ver e mudar os 12 meses.</span>
                    </div>
                    <div className={`${CARTAO} overflow-x-auto`}>
                        {info ? (
                            <div className="m-3 rounded-xl bg-[#F6F8FB] p-3.5 text-[13.5px] dark:bg-[#1C2334]">
                                <b>Como funciona cada método</b>
                                <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[230px_1fr]">
                                    {Object.values(METODOS).map(([t, x]) => (
                                        <React.Fragment key={t}>
                                            <dt className="font-extrabold">{t}</dt>
                                            <dd className="text-[#5B6478] dark:text-[#AEB9CF]">{x}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                                <div className={`${SUB} mt-2`}>
                                    Em qualquer linha dá para digitar o valor do ano direto: ele fica “ajustado à mão” e é dividido pelos meses na proporção do método (ou em 12 partes iguais). Abrindo a natureza, cada mês também é editável. ↺ volta ao calculado.
                                </div>
                            </div>
                        ) : null}
                        <table className="w-full min-w-[1120px] border-collapse text-[13.5px] tabular-nums">
                            <thead>
                                <tr className="bg-[#F6F8FB] text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    <th className="px-3 py-2.5 text-left">Natureza</th>
                                    <th className="px-2 py-2.5 text-right">Base /mês</th>
                                    <th className="px-2 py-2.5 text-left">
                                        Método{' '}
                                        <button type="button" onClick={() => setInfo(!info)} aria-label="Como funciona cada método" className="ml-1 inline-grid size-6 place-items-center rounded-md border border-[#C9D1DE] align-middle dark:border-white/[0.2]">
                                            <IconInfoCircle size={14} />
                                        </button>
                                    </th>
                                    <th className="px-2 py-2.5 text-left">Parâmetro</th>
                                    <th className="px-2 py-2.5 text-right">{ano} (editável)</th>
                                    <th className="px-3 py-2.5 text-right">vs 12 meses</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SECOES.map((sec) => {
                                    const ns = folhas.filter((n) => secDe(n) === sec.id && visivel(n));
                                    if (!ns.length) return null;
                                    const cor = sec.t === 'e' ? 'text-[#3F5A0A] dark:text-[#CFE38A]' : sec.t === 'i' ? 'text-[#2E5277] dark:text-[#9DC2FF]' : 'text-[#B42318] dark:text-[#FF9C92]';
                                    const barra = sec.t === 'e' ? 'border-l-[3px] border-l-[#8FAE4A]' : sec.t === 'i' ? 'border-l-[3px] border-l-[#3D6A99]' : 'border-l-[3px] border-l-[#C7685E]';
                                    const tS = soma(ns.map((n) => soma(calc.serie[n.id])));
                                    const bS = soma(ns.map((n) => tot12(n.id)));
                                    const grupos = Array.from(new Set(ns.map((n) => n.codigo.split('.').slice(0, 2).join('.'))));
                                    return (
                                        <React.Fragment key={sec.id}>
                                            <tr className="border-t border-[#E3E8F0] bg-[#E9EFF6] font-extrabold dark:border-white/[0.08] dark:bg-[#2B3550]">
                                                <td className="px-2 py-2">
                                                    <Tg on={!!ab[sec.id]} f={() => setAb({ ...ab, [sec.id]: !ab[sec.id] })} />
                                                    {sec.nome}
                                                </td>
                                                <td className={`px-2 text-right ${cor}`}>{n0(bS / 12)}</td>
                                                <td />
                                                <td />
                                                <td className={`px-2 pr-9 text-right ${cor}`}>{n0(tS)}</td>
                                                <td className="px-3 text-right">{bS ? pctTxt((tS / bS - 1) * 100) : '—'}</td>
                                            </tr>
                                            {ab[sec.id]
                                                ? grupos.map((g) => {
                                                      const gn = ns.filter((n) => n.codigo.startsWith(g + '.'));
                                                      const kg = sec.id + g;
                                                      const tG = soma(gn.map((n) => soma(calc.serie[n.id])));
                                                      const bG = soma(gn.map((n) => tot12(n.id)));
                                                      return (
                                                          <React.Fragment key={kg}>
                                                              <tr className="border-t border-[#E3E8F0] bg-[#F6F8FB] font-extrabold dark:border-white/[0.08] dark:bg-[#252E42]">
                                                                  <td className="py-1.5 pl-7 pr-2">
                                                                      <Tg on={!!ab[kg]} f={() => setAb({ ...ab, [kg]: !ab[kg] })} />
                                                                      <span className="mr-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{g}</span>
                                                                      {nomeGrupo(g)}
                                                                  </td>
                                                                  <td className="px-2 text-right">{n0(bG / 12)}</td>
                                                                  <td />
                                                                  <td />
                                                                  <td className={`px-2 pr-9 text-right ${cor}`}>{n0(tG)}</td>
                                                                  <td className={`px-3 text-right ${SUB}`}>{bG ? pctTxt((tG / bG - 1) * 100) : '—'}</td>
                                                              </tr>
                                                              {ab[kg]
                                                                  ? gn.map((n) => (
                                                                        <LinhaNat
                                                                            key={n.id}
                                                                            n={n}
                                                                            sec={sec.id}
                                                                            k={calc.c(n)}
                                                                            v={calc.serie[n.id]}
                                                                            base={sec.id === 'I' || sec.id === 'N' ? null : calc.c(n).m === 'cal' ? null : calc.c(n).m === 'reaj' || calc.c(n).m === 'fixomes' ? u3(n.id) : media(n.id)}
                                                                            t12={tot12(n.id)}
                                                                            reaj={calc.reajDe(n, calc.c(n))}
                                                                            ehMens={n.id === d.mensalidade}
                                                                            ehOs={n.id === d.os}
                                                                            semPico={nPicos(n.id) > 0}
                                                                            cor={cor}
                                                                            barra={barra}
                                                                            aberta={!!abM[n.id]}
                                                                            abrir={() => setAbM({ ...abM, [n.id]: !abM[n.id] })}
                                                                            muda={(k) => muda(n.id, k)}
                                                                        />
                                                                    ))
                                                                  : null}
                                                          </React.Fragment>
                                                      );
                                                  })
                                                : null}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 4 · resumo */}
                    <Titulo n={4} t="Revisar e aplicar" />
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                        <Kpi k={`Receita ${ano}`} v={`R$ ${mil(soma(calc.R))}`} cls="text-[#3F5A0A] dark:text-[#CFE38A]" />
                        <Kpi k="Custos e despesas" v={`R$ ${mil(soma(calc.S))}`} s={soma(calc.R) ? `${pctTxt((soma(calc.S) / soma(calc.R)) * 100)} da receita` : ''} cls="text-[#B42318] dark:text-[#FF9C92]" />
                        <Kpi k="Resultado operacional" v={`R$ ${mil(soma(calc.RO))}`} s={soma(calc.R) ? `margem ${pctTxt((soma(calc.RO) / soma(calc.R)) * 100)}` : ''} cls={soma(calc.RO) < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#3F5A0A] dark:text-[#CFE38A]'} />
                        <Kpi k="Não operacional" v={`R$ ${mil(soma(calc.N) - soma(calc.I))}`} s={`entradas ${mil(soma(calc.N))} · saídas ${mil(soma(calc.I))}`} />
                        <Kpi k="Sobra no ano" v={`R$ ${mil(soma(calc.SA))}`} cls={soma(calc.SA) < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#3F5A0A] dark:text-[#CFE38A]'} />
                    </div>
                    <div className={`${CARTAO} overflow-x-auto`}>
                        <table className="w-full min-w-[1000px] border-collapse text-[13px] tabular-nums">
                            <thead>
                                <tr className="bg-[#F6F8FB] text-[11.5px] font-extrabold uppercase text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    <th className="px-3 py-2 text-left">Mês</th>
                                    {MESES.map((m) => (
                                        <th key={m} className="px-2 py-2 text-right">
                                            {m}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-right">{ano}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(
                                    [
                                        ['Receitas', calc.R, 'e', false],
                                        ['Custos e despesas', calc.S.map((x) => -x), 's', false],
                                        ['Resultado operacional', calc.RO, '', true],
                                        ['Entradas não operacionais', calc.N, 'e', false],
                                        ['Investimentos, empréstimos e retiradas', calc.I.map((x) => -x), 'i', false],
                                        ['Sobra no mês', calc.SA, '', true],
                                    ] as [string, number[], string, boolean][]
                                ).map(([r, v, t, forte]) => (
                                    <tr key={r} className={`border-t border-[#E3E8F0] dark:border-white/[0.08] ${forte ? 'bg-[#E9EFF6] font-extrabold dark:bg-[#2B3550]' : ''}`}>
                                        <td className="px-3 py-1.5">{r}</td>
                                        {[...v, soma(v)].map((x, i) => (
                                            <td key={i} className={`px-2 py-1.5 text-right ${t === 'e' ? 'text-[#3F5A0A] dark:text-[#CFE38A]' : t === 's' || x < -0.5 ? 'text-[#B42318] dark:text-[#FF9C92]' : t === 'i' ? 'text-[#2E5277] dark:text-[#9DC2FF]' : ''} ${i === 12 ? 'font-extrabold' : ''}`}>
                                                {n0(x)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className={SUB}>
                        Aplicar grava as metas de {ano} na grade (sem área e local). Premissas, métodos e ajustes à mão ficam salvos com o ano, para refazer a conta ou rever a cada trimestre com o realizado. Na grade, qualquer célula continua editável.
                    </div>
                </>
            ) : null}
        </Janela>
    );
}

/* ============================== peças ============================== */

function Titulo({ n, t }: { n: number; t: string }) {
    return (
        <h3 className="mt-1 flex items-center gap-2.5 text-[17px] font-extrabold">
            <span className="grid size-7 place-items-center rounded-full bg-[#F2CB3F] text-[14px] text-[#313C55]">{n}</span>
            {t}
        </h3>
    );
}
function Cartao({ t, s, children }: { t: string; s: string; children: React.ReactNode }) {
    return (
        <div className={`${CARTAO} flex flex-col gap-2 p-3.5`}>
            <b className="text-[15px]">{t}</b>
            <div className={SUB}>{s}</div>
            {children}
        </div>
    );
}
function Campo({ r, children }: { r: string; children: React.ReactNode }) {
    return (
        <label className="flex items-center justify-between gap-3 text-[14px]">
            <span className="text-[#5B6478] dark:text-[#AEB9CF]">{r}</span>
            {children}
        </label>
    );
}
function Kpi({ k, v, s, cls = '' }: { k: string; v: string; s?: string; cls?: string }) {
    return (
        <div className={`${CARTAO} px-3 py-2`}>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{k}</div>
            <div className={`text-[18px] font-extrabold tabular-nums ${cls}`}>{v}</div>
            {s ? <div className={SUB}>{s}</div> : null}
        </div>
    );
}
const Leg = ({ c, t }: { c: string; t: string }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-sm" style={{ background: c }} /> {t}
    </span>
);
const Tg = ({ on, f }: { on: boolean; f: () => void }) => (
    <button type="button" onClick={f} aria-expanded={on} aria-label={on ? 'Fechar' : 'Abrir'} className="mr-1 inline-grid size-7 place-items-center rounded-lg align-middle hover:bg-black/5 dark:hover:bg-white/10">
        {on ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
    </button>
);

function LinhaNat({
    n,
    sec,
    k,
    v,
    base,
    t12,
    reaj,
    ehMens,
    ehOs,
    semPico,
    cor,
    barra,
    aberta,
    abrir,
    muda,
}: {
    n: Nat;
    sec: Sec;
    k: Cfg;
    v: number[];
    base: number | null;
    t12: number;
    reaj: { p: number; mes: number };
    ehMens: boolean;
    ehOs: boolean;
    semPico: boolean;
    cor: string;
    barra: string;
    aberta: boolean;
    abrir: () => void;
    muda: (k: Partial<Cfg>) => void;
}) {
    const t = soma(v);
    const ajustado = k.ov != null || !!k.mm;
    const permitidos: Metodo[] =
        sec === 'R'
            ? ([ehMens ? 'mens' : null, ehOs ? 'os' : null, 'tend', 'cal', 'fixomes', 'anual', 'fora'].filter(Boolean) as Metodo[])
            : sec === 'N' || sec === 'I'
              ? ['anual', 'fixomes', 'tend', 'cal', 'reaj', 'fora']
              : ['reaj', 'pct', 'cal', 'tend', 'fixomes', 'anual', 'fora'];
    const trocar = (m: Metodo) => {
        const x: Partial<Cfg> = { m, ov: null, mm: null, p: undefined, mes: undefined };
        if (m === 'pct') Object.assign(x, { p: 1, ref: k.ref || 'rec' });
        if (m === 'anual') Object.assign(x, { p: Math.round(t), dist: k.dist || '12' });
        if (m === 'fixomes') x.p = Math.round(t / 12);
        muda(x);
    };
    const esc = k.m === 'anual' && k.dist === 'esc';
    let par: React.ReactNode = null;
    if (k.m === 'tend')
        par = (
            <>
                <NumIn v={k.p ?? 0} onSet={(p) => muda({ p })} w="w-[64px]" />% no ano
            </>
        );
    else if (k.m === 'pct')
        par = (
            <>
                <NumIn v={k.p ?? 0} onSet={(p) => muda({ p })} w="w-[64px]" />%
                <select className="h-8 rounded-lg bg-[#F1F4F8] px-1.5 text-[13px] dark:bg-[#1C2334]" value={k.ref || 'rec'} onChange={(e) => muda({ ref: e.target.value as 'os' | 'rec' })}>
                    <option value="os">dos serviços (1.2)</option>
                    <option value="rec">da receita</option>
                </select>
            </>
        );
    else if (k.m === 'reaj' || k.m === 'cal')
        par = (
            <>
                <NumIn v={reaj.p} onSet={(p) => muda({ p })} w="w-[64px]" />%
                {k.m === 'reaj' ? (
                    <>
                        a partir de <SelMes v={reaj.mes} onSet={(mes) => muda({ mes })} />
                    </>
                ) : (
                    ' sobre os 12 meses'
                )}
                {k.m === 'reaj' && n.codigo.startsWith('3.1.') ? (
                    <label className="ml-1 inline-flex items-center gap-1">
                        <input type="checkbox" className="size-4 accent-[#313C55]" checked={!!k.d13} onChange={(e) => muda({ d13: e.target.checked })} />
                        +13º nov/dez
                    </label>
                ) : null}
            </>
        );
    else if (k.m === 'anual')
        par = (
            <>
                R$ <NumIn v={k.p ?? 0} onSet={(p) => muda({ p })} w="w-[100px]" />
                <select className="h-8 rounded-lg bg-[#F1F4F8] px-1.5 text-[13px] dark:bg-[#1C2334]" value={k.dist || '12'} onChange={(e) => muda({ dist: e.target.value as Cfg['dist'] })}>
                    <option value="12">em 12 meses</option>
                    <option value="mes">tudo em</option>
                    <option value="parc">parcelas a partir de</option>
                    <option value="esc">nos meses marcados</option>
                </select>
                {k.dist === 'mes' || k.dist === 'parc' ? <SelMes v={k.mes ?? 0} onSet={(mes) => muda({ mes })} /> : null}
                {k.dist === 'parc' ? (
                    <>
                        <NumIn v={k.np ?? 1} onSet={(np) => muda({ np })} w="w-[44px]" />x
                    </>
                ) : null}
            </>
        );
    else if (k.m === 'fixomes')
        par = (
            <>
                R$ <NumIn v={k.p ?? 0} onSet={(p) => muda({ p })} w="w-[100px]" />
                /mês
            </>
        );
    else if (k.m === 'mens' || k.m === 'os') par = <span className="text-[#5B6478] dark:text-[#AEB9CF]">premissas ↑</span>;
    return (
        <>
            <tr className="border-t border-[#EEF2F7] dark:border-white/[0.06]">
                <td className={`py-1 pl-14 pr-2 ${barra}`}>
                    <button type="button" className="text-left hover:underline" onClick={abrir}>
                        <span className="mr-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{n.codigo}</span>
                        {n.nome}
                    </button>
                    {semPico ? <span className={`${SELO} ${S_AVISO} ml-1.5`}>sem pico</span> : null}
                    {ajustado ? <span className={`${SELO} ${S_AB} ml-1.5`}>ajustado à mão</span> : null}
                </td>
                <td className="px-2 text-right">{base === null ? <span className={SUB}>{sec === 'I' || sec === 'N' ? `12 meses: ${n0(t12)}` : 'calendário'}</span> : n0(base)}</td>
                <td className="px-2">
                    <select className="h-8 max-w-[220px] rounded-lg bg-[#F1F4F8] px-1.5 text-[13px] dark:bg-[#1C2334]" value={k.m} onChange={(e) => trocar(e.target.value as Metodo)} title={METODOS[k.m][1]}>
                        {permitidos.map((m) => (
                            <option key={m} value={m}>
                                {METODOS[m][0]}
                            </option>
                        ))}
                    </select>
                </td>
                <td className="px-2">
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{par}</span>
                </td>
                <td className={`whitespace-nowrap px-2 text-right font-extrabold ${cor}`}>
                    <NumIn v={Math.round(t)} onSet={(ov) => muda({ ov, mm: null })} w="w-[110px]" dest={ajustado} rot={`${n.nome} no ano`} />
                    {ajustado ? (
                        <button type="button" className="ml-1 align-middle text-[#B78A00] dark:text-[#F2CB3F]" title="Voltar ao calculado" onClick={() => muda({ ov: null, mm: null })}>
                            <IconRotate size={16} />
                        </button>
                    ) : (
                        <span className="ml-1 inline-block w-4" />
                    )}
                </td>
                <td className={`px-3 text-right ${SUB}`}>{t12 ? pctTxt((t / t12 - 1) * 100) : '—'}</td>
            </tr>
            {aberta || esc ? (
                <tr>
                    <td colSpan={6} className="bg-[#F6F8FB] px-3 pb-2.5 pt-1.5 dark:bg-[#1A2131]">
                        <div className={`${SUB} mb-1.5`}>{esc ? 'Marque os meses em que o valor cai (dividido igual entre eles):' : 'Mês a mês · digite num mês para mudar só ele'}</div>
                        <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-12">
                            {v.map((x, m) =>
                                esc ? (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => {
                                            const e = k.esc?.length ? k.esc : [0];
                                            muda({ esc: e.includes(m) ? e.filter((y) => y !== m) : [...e, m].sort((a, b) => a - b) });
                                        }}
                                        className={`rounded-lg px-2 py-1 text-right text-[12.5px] ${(k.esc?.length ? k.esc : [0]).includes(m) ? 'bg-[#FCF3CC] ring-2 ring-[#E0B400] dark:bg-[#F2CB3F]/15' : 'bg-white dark:bg-[#252E42]'}`}
                                    >
                                        <span className="block text-left text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">{MESES[m]}</span>
                                        {n0(x)}
                                    </button>
                                ) : (
                                    <label key={m} className="rounded-lg bg-white px-1.5 py-1 dark:bg-[#252E42]">
                                        <span className="block text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">{MESES[m]}</span>
                                        <NumIn
                                            v={Math.round(x)}
                                            w="w-full"
                                            dest={!!k.mm && k.mm[m] != null}
                                            rot={`${n.nome} em ${MESES[m]}`}
                                            onSet={(val) => {
                                                const mm = [...(k.mm ?? Array(12).fill(null))];
                                                mm[m] = val;
                                                muda({ mm, ov: null });
                                            }}
                                        />
                                    </label>
                                ),
                            )}
                        </div>
                    </td>
                </tr>
            ) : null}
        </>
    );
}
