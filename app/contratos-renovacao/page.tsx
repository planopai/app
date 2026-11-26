"use client";

/**
 * Renovação de carnês (/contratos-renovacao, chave contratos-renovacao) · Contratos, fase 3A (26/11/2026).
 * Prévia aprovada "Mensalidades do Contrato" (abas Renovação, Automático e Análise). Back-end: ct_mensalidades.php.
 * Abas: Renovação (carnês que acabam até N dias; renovar em lote com ou sem reajuste), Análise (receita das mensalidades
 * por parte: plano, cada aditivo, beneficiários pagos, bonificações) e Índices (índice do mês e reajuste automático; a Gestão altera).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { IconCalendarRepeat } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import { api, BTN_PEQ, BTN_PRI, CAMPO, CAMPO_P, CARTAO, ERRO, mensagemErro, NOTA, PILULA, ROTULO, S_AVISO, SELO, SUB, useAviso } from "../contas-pagar/components/fin";
import { brl, isoParaBR, mesBRCurto } from "../contratos/components/ct";
import { URL_MENS } from "../contratos/components/Financeiro";

type Aba = "renovacao" | "analise" | "indices";
type LinhaRen = {
    contrato_id: number;
    numero: string;
    titular: string;
    plano: string;
    flex: boolean;
    situacao: string;
    ciclo: number;
    acaba: string;
    valor_plano: number;
    mensal_hoje: number;
    outros: number;
    indice: string;
    vencidas: number;
    teste: boolean;
};
type Indice = { indice: string; competencia: string; percentual: number; fonte?: string; confirmado?: boolean };
type Analise = { de: string; ate: string; linhas: { chave: string; nome: string; emitido: number; recebido: number; contratos: number }[]; contratos: number; ativos: number; emitido: number; recebido: number };

const TH = "px-2 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
const TD = "px-2 py-2.5 align-top";
const TR = "border-t border-[#E3E8F0] dark:border-white/[0.08]";
const NUM = "text-right tabular-nums";
const INDICES = [
    ["IPCA_12_meses", "IPCA 12 meses"],
    ["INPC_12_meses", "INPC 12 meses"],
    ["IGPM_12_meses", "IGP-M 12 meses"],
] as const;
const nomeIndice = (k: string) => INDICES.find((i) => i[0] === k)?.[1] ?? k.replace(/_/g, " ");
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const mesAtual = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const numero = (s: string) => {
    const t = s.replace(/%|\s/g, "").replace(",", ".");
    return t === "" ? null : Number(t);
};

export default function RenovacaoCarnes() {
    const { avisar, aviso } = useAviso();
    const [aba, setAba] = useState<Aba>("renovacao");
    const [base, setBase] = useState<{ pode: { gestao: boolean; renovar: boolean }; parametros: { reajuste_automatico: boolean; renovacao_dias: number }; indices: Indice[] } | null>(null);
    const [erro, setErro] = useState("");
    const carregarBase = useCallback(async () => {
        try {
            const j = await api(URL_MENS, "base");
            setBase(j.dados);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível abrir a tela.");
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void carregarBase();
    }, [carregarBase]);

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconCalendarRepeat} titulo="Renovação de carnês" />
                {erro ? <div className={ERRO}>{erro}</div> : null}
                <div role="tablist" className="flex flex-wrap gap-2">
                    {(
                        [
                            ["renovacao", "Renovação"],
                            ["analise", "Análise"],
                            ["indices", "Índices e automático"],
                        ] as [Aba, string][]
                    ).map(([k, n]) => (
                        <button key={k} type="button" role="tab" aria-selected={aba === k} className={PILULA(aba === k)} onClick={() => setAba(k)}>
                            {n}
                        </button>
                    ))}
                </div>
                {base ? (
                    aba === "renovacao" ? (
                        <Renovacao avisar={avisar} automatico={base.parametros.reajuste_automatico} diasPadrao={base.parametros.renovacao_dias} />
                    ) : aba === "analise" ? (
                        <AbaAnalise />
                    ) : (
                        <Indices base={base} avisar={avisar} recarregar={carregarBase} />
                    )
                ) : !erro ? (
                    <div className={SUB}>Carregando…</div>
                ) : null}
            </div>
            {aviso}
        </div>
    );
}

/* ---------------------------------------------------------------- Renovação */

function Renovacao({ avisar, automatico, diasPadrao }: { avisar: (m: string) => void; automatico: boolean; diasPadrao: number }) {
    const [dias, setDias] = useState(diasPadrao || 60);
    const [linhas, setLinhas] = useState<LinhaRen[] | null>(null);
    const [indices, setIndices] = useState<Indice[]>([]);
    const [marc, setMarc] = useState<Record<number, boolean>>({});
    const [reaj, setReaj] = useState<Record<number, string>>({});
    const [comReajuste, setComReajuste] = useState(true);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_MENS, "renovacao", undefined, `&dias=${dias}`);
            const ls: LinhaRen[] = j.dados.linhas;
            const ind: Indice[] = j.dados.indices;
            setLinhas(ls);
            setIndices(ind);
            setMarc({});
            const r: Record<number, string> = {};
            for (const l of ls) {
                const i = ind.find((x) => x.indice === l.indice);
                r[l.contrato_id] = i ? String(i.percentual).replace(".", ",") : "";
            }
            setReaj(r);
            setErro("");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível carregar os carnês.");
            if (m) setErro(m);
        }
    }, [dias]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const escolhidos = (linhas || []).filter((l) => marc[l.contrato_id]);
    const todos = !!linhas?.length && linhas.every((l) => marc[l.contrato_id]);

    const renovar = async () => {
        const itens = [];
        for (const l of escolhidos) {
            const p = comReajuste ? numero(reaj[l.contrato_id] || "") : null;
            if (comReajuste && (p === null || Number.isNaN(p))) return avisar(`Contrato ${l.numero}: informe o reajuste (ou desmarque "Com reajuste").`);
            itens.push({ contrato_id: l.contrato_id, reajuste_pct: p });
        }
        setSalvando(true);
        try {
            const ind = escolhidos[0]?.indice;
            const j = await api(URL_MENS, "renovar", { itens, indice: comReajuste ? ind : null });
            avisar(j.msg);
            await carregar();
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível renovar.");
            if (m) avisar(m);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${CARTAO} flex flex-col gap-4 p-4 sm:p-5`}>
            <div className={NOTA}>
                <span>
                    {automatico
                        ? "Reajuste automático ligado: o sistema renova sozinho quando falta 1 parcela, com o índice do mês já confirmado. Aqui você pode adiantar ou renovar à mão."
                        : "Reajuste automático desligado: o sistema só lista os carnês perto do fim. Você escolhe quem renovar e como."}{" "}
                    O reajuste vale só para o carnê novo; as parcelas já geradas não mudam. No FLEX, a renovação confere a faixa pela idade da pessoa mais velha.
                </span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap gap-2">
                    {[60, 30, 15].map((n) => (
                        <button key={n} type="button" className={PILULA(dias === n)} onClick={() => setDias(n)}>
                            Próximos {n} dias
                        </button>
                    ))}
                </div>
                <label className="flex min-h-11 items-center gap-2.5 text-[14.5px] font-bold">
                    <input type="checkbox" className="size-5 accent-[#313C55]" checked={comReajuste} onChange={(e) => setComReajuste(e.target.checked)} />
                    Com reajuste
                </label>
                {indices.length ? (
                    <span className={SUB}>
                        {indices.map((i) => `${nomeIndice(i.indice)} de ${mesBRCurto(i.competencia)}: ${pct(i.percentual)}`).join(" · ")} (confirmado pela Gestão; dá para mudar em cada linha)
                    </span>
                ) : linhas?.length ? (
                    <span className={`${SELO} ${S_AVISO}`}>Nenhum índice confirmado: veja a aba Índices</span>
                ) : null}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {!linhas ? (
                <div className={SUB}>Carregando…</div>
            ) : linhas.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-[14.5px]">
                        <thead>
                            <tr>
                                <th className={`${TH} w-10`}>
                                    <input
                                        type="checkbox"
                                        aria-label="Marcar todos"
                                        className="size-5 accent-[#313C55]"
                                        checked={todos}
                                        onChange={() => setMarc(todos ? {} : Object.fromEntries(linhas.map((l) => [l.contrato_id, true])))}
                                    />
                                </th>
                                <th className={TH}>Contrato</th>
                                <th className={TH}>Plano</th>
                                <th className={TH}>Carnê acaba</th>
                                <th className={`${TH} text-right`}>Plano hoje</th>
                                <th className={TH}>Reajuste</th>
                                <th className={`${TH} text-right`}>Plano novo</th>
                                <th className={`${TH} text-right`}>Parcela nova</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map((l) => {
                                const p = comReajuste ? numero(reaj[l.contrato_id] || "") : 0;
                                const novo = p === null || Number.isNaN(p) ? null : Math.round(l.valor_plano * (1 + p / 100) * 100) / 100;
                                return (
                                    <tr key={l.contrato_id} className={`${TR} ${marc[l.contrato_id] ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : ""}`}>
                                        <td className={TD}>
                                            <input
                                                type="checkbox"
                                                aria-label={`Marcar o contrato ${l.numero}`}
                                                className="size-5 accent-[#313C55]"
                                                checked={!!marc[l.contrato_id]}
                                                onChange={() => setMarc((m) => ({ ...m, [l.contrato_id]: !m[l.contrato_id] }))}
                                            />
                                        </td>
                                        <td className={TD}>
                                            <b>{l.numero}</b>
                                            {l.teste ? <span className={SUB}> · teste</span> : null}
                                            <div className={`${SUB} break-words`}>{l.titular}</div>
                                            {l.vencidas ? <span className={`${SELO} ${S_AVISO} mt-1`}>{l.vencidas} vencida(s)</span> : null}
                                        </td>
                                        <td className={TD}>
                                            {l.plano}
                                            {l.flex ? <div className={SUB}>FLEX: confere a faixa</div> : null}
                                        </td>
                                        <td className={TD}>
                                            {isoParaBR(l.acaba)}
                                            <div className={SUB}>carnê {l.ciclo}</div>
                                        </td>
                                        <td className={`${TD} ${NUM}`}>{brl(l.valor_plano)}</td>
                                        <td className={TD}>
                                            {comReajuste ? (
                                                <input
                                                    className={`${CAMPO_P} w-24`}
                                                    inputMode="decimal"
                                                    aria-label={`Reajuste do contrato ${l.numero}`}
                                                    value={reaj[l.contrato_id] ?? ""}
                                                    onChange={(e) => setReaj((r) => ({ ...r, [l.contrato_id]: e.target.value }))}
                                                />
                                            ) : (
                                                <span className={SUB}>sem reajuste</span>
                                            )}
                                            <div className={SUB}>{nomeIndice(l.indice)}</div>
                                        </td>
                                        <td className={`${TD} ${NUM} font-extrabold`}>{novo === null ? "—" : brl(novo)}</td>
                                        <td className={`${TD} ${NUM}`}>
                                            {novo === null ? "—" : brl(novo + l.outros)}
                                            {l.outros ? <div className={SUB}>com {brl(l.outros)} de aditivos e extras</div> : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className={NOTA}>
                    <span>Nenhum carnê acaba nos próximos {dias} dias.</span>
                </div>
            )}
            {linhas?.length ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className={SUB}>{escolhidos.length ? `${escolhidos.length} contrato(s) marcado(s)` : "Marque os contratos para renovar."}</span>
                    <button type="button" className={BTN_PRI} disabled={!escolhidos.length || salvando} onClick={renovar}>
                        {salvando ? "Renovando…" : "Renovar marcados"}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------- Análise */

function AbaAnalise() {
    const [de, setDe] = useState(mesAtual());
    const [ate, setAte] = useState(mesAtual());
    const [teste, setTeste] = useState(false);
    const [a, setA] = useState<Analise | null>(null);
    const [erro, setErro] = useState("");
    useEffect(() => {
        (async () => {
            try {
                const j = await api(URL_MENS, "analise", undefined, `&de=${de}&ate=${ate}&teste=${teste ? 1 : 0}`);
                setA(j.dados);
                setErro("");
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível carregar a análise.");
                if (m) setErro(m);
            }
        })();
    }, [de, ate, teste]);
    const max = useMemo(() => Math.max(1, ...(a?.linhas || []).map((l) => Math.abs(l.emitido))), [a]);

    return (
        <div className={`${CARTAO} flex flex-col gap-4 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                    <span className={ROTULO}>De</span>
                    <input type="month" className={`${CAMPO} w-44`} value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
                </label>
                <label className="block">
                    <span className={ROTULO}>Até</span>
                    <input type="month" className={`${CAMPO} w-44`} value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
                </label>
                <label className="flex min-h-12 items-center gap-2.5 text-[14.5px] font-bold">
                    <input type="checkbox" className="size-5 accent-[#313C55]" checked={teste} onChange={(e) => setTeste(e.target.checked)} />
                    Contratos de teste
                </label>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {a ? (
                a.linhas.length ? (
                    <>
                        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                            <Num rotulo="Emitido" valor={brl(a.emitido)} />
                            <Num rotulo="Recebido" valor={brl(a.recebido)} sub={a.emitido ? `${Math.round((a.recebido / a.emitido) * 100)}% do emitido` : ""} />
                            <Num rotulo="Contratos no período" valor={String(a.contratos)} />
                            <Num rotulo="Contratos ativos hoje" valor={String(a.ativos)} sub="ativos, suspensos e em cobrança jurídica" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-[14.5px]">
                                <thead>
                                    <tr>
                                        <th className={TH}>Parte da mensalidade</th>
                                        <th className={`${TH} text-right`}>Contratos</th>
                                        <th className={`${TH} text-right`}>Emitido</th>
                                        <th className={`${TH} text-right`}>Recebido</th>
                                        <th className={TH}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {a.linhas.map((l) => (
                                        <tr key={l.chave} className={TR}>
                                            <td className={TD}>{l.nome}</td>
                                            <td className={`${TD} ${NUM}`}>{l.contratos}</td>
                                            <td className={`${TD} ${NUM}`}>{l.emitido < 0 ? `− ${brl(-l.emitido)}` : brl(l.emitido)}</td>
                                            <td className={`${TD} ${NUM} font-extrabold`}>{l.recebido < 0 ? `− ${brl(-l.recebido)}` : brl(l.recebido)}</td>
                                            <td className={`${TD} w-[30%]`}>
                                                <div className="h-2.5 rounded-full bg-[#F1F4F8] dark:bg-white/[0.08]">
                                                    <div className={`h-2.5 rounded-full ${l.emitido < 0 ? "bg-[#B3CE52]" : "bg-[#3D6A99]"}`} style={{ width: `${(Math.abs(l.emitido) / max) * 100}%` }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={SUB}>
                            Emitido: parcelas do período pela referência (sem as canceladas). Recebido: a parte paga de cada parcela, dividida na mesma proporção da composição. Multa e juros ficam fora.
                            {teste ? "" : " Contratos de teste ficam fora (marque para ver só eles)."}
                        </div>
                    </>
                ) : (
                    <div className={NOTA}>
                        <span>Nenhuma parcela de {mesBRCurto(de)} a {mesBRCurto(ate)}{teste ? " nos contratos de teste" : ""}.</span>
                    </div>
                )
            ) : (
                <div className={SUB}>Carregando…</div>
            )}
        </div>
    );
}

function Num({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[#F6F8FB] px-3.5 py-3 dark:bg-[#1C2334]">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</span>
            <span className="text-[20px] font-extrabold leading-tight">{valor}</span>
            {sub ? <span className={SUB}>{sub}</span> : null}
        </div>
    );
}

/* ---------------------------------------------------------------- Índices e automático */

function Indices({
    base,
    avisar,
    recarregar,
}: {
    base: { pode: { gestao: boolean }; parametros: { reajuste_automatico: boolean; renovacao_dias: number }; indices: Indice[] };
    avisar: (m: string) => void;
    recarregar: () => Promise<void>;
}) {
    const gestao = base.pode.gestao;
    const [indice, setIndice] = useState<string>("IPCA_12_meses");
    const [comp, setComp] = useState(mesAtual());
    const [valor, setValor] = useState("");
    const [dias, setDias] = useState(String(base.parametros.renovacao_dias));
    const [salvando, setSalvando] = useState(false);

    const enviar = async (acao: string, corpo: Record<string, unknown>) => {
        setSalvando(true);
        try {
            const j = await api(URL_MENS, acao, corpo);
            avisar(j.msg);
            await recarregar();
            return true;
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar.");
            if (m) avisar(m);
            return false;
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className={`${CARTAO} flex flex-col gap-3 p-4 sm:p-5`}>
                <h2 className="text-[17px] font-extrabold">Reajuste automático</h2>
                <div className={NOTA}>
                    <span>
                        Ligado: a rotina da madrugada renova sozinha o carnê quando falta 1 parcela, com o índice da regra de Reajuste do plano, desde que o índice do mês (ou do anterior) esteja confirmado aqui. Sem índice confirmado, não renova e o
                        contrato continua na lista da Renovação.
                    </span>
                </div>
                <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-bold">
                    <input
                        type="checkbox"
                        className="size-5 accent-[#313C55]"
                        disabled={!gestao || salvando}
                        checked={base.parametros.reajuste_automatico}
                        onChange={(e) => void enviar("parametros", { reajuste_automatico: e.target.checked })}
                    />
                    {base.parametros.reajuste_automatico ? "Ligado" : "Desligado"}
                </label>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                        <span className={ROTULO}>Lista da Renovação: carnês que acabam em até (dias)</span>
                        <input className={`${CAMPO} w-32`} inputMode="numeric" disabled={!gestao} value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))} />
                    </label>
                    {gestao ? (
                        <button type="button" className={BTN_PEQ} disabled={salvando || !dias} onClick={() => void enviar("parametros", { renovacao_dias: Number(dias) })}>
                            Salvar
                        </button>
                    ) : null}
                </div>
                {!gestao ? <div className={SUB}>Só a Gestão altera.</div> : null}
            </div>

            <div className={`${CARTAO} flex flex-col gap-3 p-4 sm:p-5`}>
                <h2 className="text-[17px] font-extrabold">Índice do mês</h2>
                {gestao ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className={ROTULO}>Índice</span>
                            <select className={CAMPO} value={indice} onChange={(e) => setIndice(e.target.value)}>
                                {INDICES.map(([k, n]) => (
                                    <option key={k} value={k}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className={ROTULO}>Mês</span>
                            <input type="month" className={CAMPO} value={comp} onChange={(e) => e.target.value && setComp(e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={ROTULO}>Acumulado em 12 meses (%)</span>
                            <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="4,68" />
                        </label>
                        <div className="sm:col-span-3">
                            <button
                                type="button"
                                className={BTN_PRI}
                                disabled={salvando || numero(valor) === null}
                                onClick={async () => {
                                    if (await enviar("indice", { indice, competencia: comp, percentual: numero(valor) })) setValor("");
                                }}
                            >
                                Confirmar índice
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={SUB}>Só a Gestão confirma o índice.</div>
                )}
                {base.indices.length ? (
                    <table className="w-full text-[14.5px]">
                        <thead>
                            <tr>
                                <th className={TH}>Índice</th>
                                <th className={TH}>Mês</th>
                                <th className={`${TH} text-right`}>12 meses</th>
                            </tr>
                        </thead>
                        <tbody>
                            {base.indices.map((i) => (
                                <tr key={i.indice + i.competencia} className={TR}>
                                    <td className={TD}>{nomeIndice(i.indice)}</td>
                                    <td className={TD}>{mesBRCurto(i.competencia)}</td>
                                    <td className={`${TD} ${NUM} font-extrabold`}>{pct(i.percentual)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className={SUB}>Nenhum índice confirmado ainda. Fonte: Banco Central (série do IPCA acumulado em 12 meses).</div>
                )}
            </div>
        </div>
    );
}
