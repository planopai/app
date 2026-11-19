"use client";

/**
 * Novo contrato (assistente) — Contratos fase 2, prévia aprovada em 19/11/2026.
 * 1. Titular e plano · 2. Beneficiários (sucessor marcado aqui) · 3. Aditivos · 4. Cobrança · 5. Resumo → "Salvar pré-cadastro".
 * Os valores vêm do servidor (ct_contratos.php?action=simular), pela tabela de preço vigente. Vira Ativo quando a adesão é paga.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api, BTN_PEQ, BTN_PRI, BTN_SEC, CARTAO, mensagemErro, NOTA, ROTULO, SUB } from "../../contas-pagar/components/fin";
import { type Base, brl, CampoCpf, Combo, cpfValido, dataValidar, PORTES, soDigitos, TIPO_VENDA, URL_CT } from "./ct";
import { type BenefForm, benefParaEnvio, benefVazio, JanelaBenef } from "./Benef";
import { CamposTitular, type TitularForm, titularParaEnvio, titularProblemas, titularVazio } from "./Titular";

const PASSOS = ["Titular e plano", "Beneficiários", "Aditivos", "Cobrança", "Resumo"];

type Cobranca = {
    tipo_venda: string;
    forma_cobranca: string;
    dia_pagamento: number;
    adiar_dias: number;
    vendedor_usuario_id: number | null;
    origem: string | null;
    indicador: number | null;
    responsavel: "titular" | "outro";
    responsavel_cpf: string;
    responsavel_nome: string;
};

type Calculo = {
    valor_adesao: number;
    valor_mensal: number;
    flex: { ini: number | null; fim: number | null; idade: number; idx: number } | null;
    extras: Record<string, number> | number[];
    aditivos: { aditivo_id: number; nome: string; condicao: string | null; valor_mensal: number }[];
    total_mensal: number;
};

export default function Novo({ base, recarregarBase, avisar, onCriado }: { base: Base; recarregarBase: () => Promise<unknown>; avisar: (m: string) => void; onCriado: (id: number) => void }) {
    const [passo, setPasso] = useState(0);
    const [t, setT] = useState<TitularForm>(titularVazio());
    const setTit = useCallback((p: Partial<TitularForm>) => setT((x) => ({ ...x, ...p })), []);
    const [planoId, setPlanoId] = useState<number | null>(null);
    const [benef, setBenef] = useState<BenefForm[]>([]);
    const [editando, setEditando] = useState<BenefForm | null>(null);
    const [aditivos, setAditivos] = useState<number[]>([]);
    const [cob, setCob] = useState<Cobranca>({
        tipo_venda: "nova",
        forma_cobranca: "bolepix",
        dia_pagamento: 10,
        adiar_dias: 0,
        vendedor_usuario_id: base.eu_id || null,
        origem: null,
        indicador: null,
        responsavel: "titular",
        responsavel_cpf: "",
        responsavel_nome: "",
    });
    const [indicadores, setIndicadores] = useState<{ v: number; t: string; s?: string }[]>([]);
    const [calc, setCalc] = useState<Calculo | null>(null);
    const [erroCalc, setErroCalc] = useState("");
    const [salvando, setSalvando] = useState(false);

    const venda = base.planos.filter((p) => p.situacao === "vende" && p.pronto);
    const plano = base.planos.find((p) => p.id === planoId) ?? null;
    const extraItem = plano?.itens.find((i) => i.tipo === "extra") ?? null;
    const regraB = plano?.beneficiarios ?? {};
    const aceitaPet = !!regraB.pet;
    const nascObrig = !!regraB.nascimento_obrigatorio;
    const nascTitular = dataValidar(t.nascimento, base.hoje)[0];

    // aditivos que o plano não oferece saem da escolha
    useEffect(() => {
        if (!plano) return;
        setAditivos((a) => a.filter((id) => plano.aditivos.some((x) => x.id === id && x.nome !== "Sucessor do contrato")));
        if (!aceitaPet) setBenef((l) => l.filter((b) => b.tipo !== "pet"));
        if (!extraItem) setBenef((l) => l.map((b) => ({ ...b, pago: false })));
    }, [planoId]); // eslint-disable-line react-hooks/exhaustive-deps

    // valores pelo servidor
    const vez = useRef(0);
    useEffect(() => {
        if (!plano || !nascTitular) {
            setCalc(null);
            return;
        }
        const minha = ++vez.current;
        const tm = setTimeout(async () => {
            try {
                const j = await api(URL_CT, "simular", { titular_nascimento: nascTitular, plano_id: plano.id, beneficiarios: benef.map((b) => benefParaEnvio(b, base.hoje)), aditivos });
                if (minha === vez.current) {
                    setCalc(j.dados);
                    setErroCalc("");
                }
            } catch (e: any) {
                if (minha === vez.current) {
                    setCalc(null);
                    setErroCalc(mensagemErro(e, "Não foi possível calcular.") || "");
                }
            }
        }, 250);
        return () => clearTimeout(tm);
    }, [plano, nascTitular, benef, aditivos, base.hoje]);

    const buscaIndicador = useRef<ReturnType<typeof setTimeout> | null>(null);
    const procurarIndicador = (q: string) => {
        if (buscaIndicador.current) clearTimeout(buscaIndicador.current);
        if (q.trim().length < 2) return;
        buscaIndicador.current = setTimeout(async () => {
            try {
                const j = await api(URL_CT, "indicadores", undefined, `&q=${encodeURIComponent(q.trim())}`);
                setIndicadores((j.dados || []).map((r: any) => ({ v: r.id, t: r.nome, s: "contrato " + r.numero })));
            } catch {
                /* segue sem sugestões */
            }
        }, 250);
    };

    const probTitular = titularProblemas(t, base.hoje);
    const problemas: string[][] = [
        [...probTitular, ...(!plano ? ["plano"] : [])],
        [...(benef.filter((b) => b.sucessor).length > 1 ? ["só um sucessor"] : []), ...(erroCalc ? [erroCalc] : [])],
        [],
        [
            ...(cob.responsavel === "outro" && !cpfValido(soDigitos(cob.responsavel_cpf)) ? ["CPF do responsável pelo pagamento"] : []),
            ...(cob.responsavel === "outro" && !cob.responsavel_nome.trim() ? ["nome do responsável pelo pagamento"] : []),
            ...(!cob.vendedor_usuario_id ? ["vendedor"] : []),
            ...(!cob.origem ? ["origem da venda"] : []),
        ],
        [],
    ];
    const primeiroComProblema = problemas.findIndex((p, i) => i < 4 && p.length);

    const salvar = async () => {
        if (primeiroComProblema >= 0) {
            setPasso(primeiroComProblema);
            return avisar("Falta: " + problemas[primeiroComProblema].join(", ") + ".");
        }
        setSalvando(true);
        try {
            const j = await api(URL_CT, "novo", {
                titular: titularParaEnvio(t, base.hoje),
                plano_id: planoId,
                beneficiarios: benef.map((b) => benefParaEnvio(b, base.hoje)),
                aditivos,
                cobranca: {
                    tipo_venda: cob.tipo_venda,
                    forma_cobranca: cob.forma_cobranca,
                    dia_pagamento: cob.dia_pagamento,
                    adiar_dias: cob.adiar_dias,
                    vendedor_usuario_id: cob.vendedor_usuario_id,
                    origem: cob.origem,
                    indicador_contrato_id: cob.indicador,
                    responsavel_cpf: cob.responsavel === "outro" ? soDigitos(cob.responsavel_cpf) : "",
                    responsavel_nome: cob.responsavel === "outro" ? cob.responsavel_nome.trim() : "",
                },
            });
            avisar(j.msg);
            onCriado(j.dados.id);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar o pré-cadastro.");
            if (m) avisar(m);
        } finally {
            setSalvando(false);
        }
    };

    const extrasDe = (i: number) => (calc ? (calc.extras as any)[i] ?? null : null);
    const suc = benef.find((b) => b.sucessor);

    const resumo = useMemo(
        () => (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-[#F6F8FB] p-4 text-[15px] dark:bg-[#1C2334]">
                {calc ? (
                    <>
                        <div className="flex justify-between gap-3">
                            <span>Adesão</span>
                            <b>{brl(calc.valor_adesao)}</b>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span>
                                Mensalidade {plano?.nome}
                                {calc.flex ? ` · faixa ${calc.flex.ini ?? 0}${calc.flex.fim !== null ? " a " + calc.flex.fim : " ou mais"} anos (mais velho: ${calc.flex.idade})` : ""}
                            </span>
                            <b>{brl(calc.valor_mensal)}</b>
                        </div>
                        {benef.map((b, i) =>
                            b.pago ? (
                                <div key={b.chave} className="flex justify-between gap-3">
                                    <span>Extra: {b.nome}</span>
                                    <b>{extrasDe(i) ? brl(extrasDe(i)) : "sem custo"}</b>
                                </div>
                            ) : null,
                        )}
                        {calc.aditivos.map((a) => (
                            <div key={a.aditivo_id} className="flex justify-between gap-3">
                                <span>Aditivo {a.nome}</span>
                                <b>{a.valor_mensal ? brl(a.valor_mensal) : "incluído"}</b>
                            </div>
                        ))}
                        <div className="mt-1 flex justify-between gap-3 border-t border-[#E3E8F0] pt-2 text-[17px] dark:border-white/[0.12]">
                            <span className="font-extrabold">Mensal</span>
                            <b>{brl(calc.total_mensal)}</b>
                        </div>
                    </>
                ) : (
                    <span className={SUB}>{erroCalc || "Os valores aparecem quando o plano e a data de nascimento do titular estiverem preenchidos."}</span>
                )}
            </div>
        ),
        [calc, erroCalc, plano, benef], // eslint-disable-line react-hooks/exhaustive-deps
    );

    return (
        <div className={`${CARTAO} flex flex-col gap-4 p-4 sm:p-5`}>
            <div className="flex flex-wrap gap-2">
                {PASSOS.map((n, i) => (
                    <button
                        key={n}
                        type="button"
                        aria-current={i === passo ? "step" : undefined}
                        onClick={() => setPasso(i)}
                        className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[13.5px] font-extrabold ${
                            i === passo
                                ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                : i < passo && !problemas[i].length
                                  ? "bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"
                                  : "border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]"
                        }`}
                    >
                        {i + 1}. {n}
                    </button>
                ))}
            </div>

            {passo === 0 ? (
                <>
                    <CamposTitular t={t} set={setTit} base={base} recarregarBase={recarregarBase} avisar={avisar} />
                    <div>
                        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">Plano</h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <span className={ROTULO}>Plano</span>
                                <Combo
                                    rotulo="Plano"
                                    opcoes={venda.map((p) => {
                                        const tit = p.itens.find((i) => i.tipo === "titular");
                                        return { v: p.id, t: p.nome, s: p.tipo_preco === "faixas" ? "pela idade do mais velho" : tit ? brl(tit.valor_mensal) + "/mês" : "" };
                                    })}
                                    valor={planoId}
                                    onChange={setPlanoId}
                                />
                                <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Só aparecem os planos prontos para vender. A tabela de preço e as regras do dia ficam gravadas no contrato.</span>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}

            {passo === 1 ? (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-[14.5px]">
                            <thead>
                                <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                    <th className="px-2 py-2 font-extrabold">Nome</th>
                                    <th className="px-2 py-2 font-extrabold">Tipo</th>
                                    <th className="px-2 py-2 font-extrabold">Parentesco</th>
                                    <th className="px-2 py-2 font-extrabold">Nascimento</th>
                                    <th className="px-2 py-2 text-right font-extrabold">Valor</th>
                                    <th className="px-2 py-2 font-extrabold">Sucessor</th>
                                    <th className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                    <td className="px-2 py-2.5">{t.nome || "Titular (passo 1)"}</td>
                                    <td className="px-2 py-2.5">Titular</td>
                                    <td className="px-2 py-2.5">—</td>
                                    <td className="px-2 py-2.5">{t.nascimento || "—"}</td>
                                    <td className="px-2 py-2.5 text-right">—</td>
                                    <td className="px-2 py-2.5 text-[#5B6478]">—</td>
                                    <td />
                                </tr>
                                {benef.map((b, i) => (
                                    <tr key={b.chave} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                        <td className="px-2 py-2.5 font-bold">{b.nome}</td>
                                        <td className="px-2 py-2.5">{b.tipo === "pet" ? `Pet (${b.pet_especie}, ${PORTES[b.pet_porte || ""] || ""})` : b.pago ? "Extra pago" : "Dependente"}</td>
                                        <td className="px-2 py-2.5">{b.tipo === "pet" ? "—" : b.parentesco}</td>
                                        <td className="px-2 py-2.5">{b.nascimento || "—"}</td>
                                        <td className="px-2 py-2.5 text-right">{b.pago ? (extrasDe(i) ? brl(extrasDe(i)) : "sem custo") : "—"}</td>
                                        <td className="px-2 py-2.5">
                                            {b.tipo === "pet" ? (
                                                <span className="text-[#5B6478]">—</span>
                                            ) : (
                                                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2">
                                                    <input type="radio" name="sucessor" className="size-5 accent-[#313C55]" checked={b.sucessor} onChange={() => setBenef((l) => l.map((x) => ({ ...x, sucessor: x.chave === b.chave })))} />
                                                    <span className="text-[14px]">É o sucessor</span>
                                                </label>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                                            <button type="button" className={BTN_PEQ} aria-label={`Editar ${b.nome}`} onClick={() => setEditando(b)}>
                                                <IconPencil size={16} />
                                            </button>{" "}
                                            <button type="button" className={BTN_PEQ} aria-label={`Tirar ${b.nome}`} onClick={() => setBenef((l) => l.filter((x) => x.chave !== b.chave))}>
                                                <IconTrash size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={BTN_SEC} onClick={() => setEditando(benefVazio())}>
                            + Beneficiário
                        </button>
                        {aceitaPet ? (
                            <button type="button" className={BTN_SEC} onClick={() => setEditando(benefVazio(true))}>
                                + Pet (nome, espécie e porte)
                            </button>
                        ) : null}
                        {suc ? (
                            <button type="button" className={BTN_SEC} onClick={() => setBenef((l) => l.map((x) => ({ ...x, sucessor: false })))}>
                                Tirar a marca de sucessor
                            </button>
                        ) : null}
                    </div>
                    {calc?.flex ? (
                        <div className="rounded-xl bg-[#E9EFF6] px-3.5 py-2.5 text-[14px] dark:bg-[#3D6A99]/25">
                            {plano?.nome}: pessoa mais velha com {calc.flex.idade} anos → faixa {calc.flex.ini ?? 0}
                            {calc.flex.fim !== null ? " a " + calc.flex.fim : " ou mais"} · {brl(calc.valor_mensal)}/mês
                        </div>
                    ) : extraItem ? (
                        <div className="rounded-xl bg-[#E9EFF6] px-3.5 py-2.5 text-[14px] dark:bg-[#3D6A99]/25">
                            Extras pagos do {plano?.nome}: {extraItem.qtd_sem_custo ? `os ${extraItem.qtd_sem_custo} primeiros sem custo, depois ` : ""}
                            {brl(extraItem.valor_mensal)} cada{extraItem.qtd_max ? ` (até ${extraItem.qtd_max})` : ""}.
                        </div>
                    ) : null}
                    {erroCalc ? <p className="text-[14px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erroCalc}</p> : null}
                    <div className={NOTA}>
                        <span>
                            <b>Sucessor do contrato:</b> nos planos novos a sucessão já vem no contrato. Marque quem é o sucessor (um por contrato, maior de idade; pet não entra). Pode ser trocado depois na ficha, com registro no histórico.
                        </span>
                    </div>
                </>
            ) : null}

            {passo === 2 ? (
                <>
                    {plano && plano.aditivos.filter((a) => a.nome !== "Sucessor do contrato").length ? (
                        plano.aditivos
                            .filter((a) => a.nome !== "Sucessor do contrato")
                            .map((a) => {
                                const incluido = (a.condicao || "").toLowerCase().includes("incluíd");
                                const v = calc?.aditivos.find((x) => x.aditivo_id === a.id);
                                return (
                                    <label key={a.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 size-5 shrink-0 accent-[#313C55]"
                                            checked={incluido || aditivos.includes(a.id)}
                                            disabled={incluido}
                                            onChange={(e) => setAditivos((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <b className="block text-[15px]">{a.nome}</b>
                                            <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{a.condicao}</span>
                                        </span>
                                        {v ? <b className="shrink-0">{v.valor_mensal ? brl(v.valor_mensal) + "/mês" : "incluído"}</b> : null}
                                    </label>
                                );
                            })
                    ) : (
                        <div className={NOTA}>O {plano?.nome || "plano"} não tem aditivos para contratar.</div>
                    )}
                    <div className={NOTA}>
                        <span>A lista vem da aba Aditivos do plano. O aditivo &quot;Sucessor do contrato&quot; só existe nos planos antigos; nos planos novos o sucessor é marcado em Beneficiários.</span>
                    </div>
                </>
            ) : null}

            {passo === 3 ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <span className={ROTULO}>Tipo de venda</span>
                            <Combo rotulo="Tipo de venda" opcoes={Object.entries(TIPO_VENDA).map(([v, t]) => ({ v, t }))} valor={cob.tipo_venda} onChange={(v) => setCob((c) => ({ ...c, tipo_venda: v || "nova" }))} />
                        </div>
                        <div>
                            <span className={ROTULO}>Forma de cobrança</span>
                            <Combo rotulo="Forma de cobrança" opcoes={Object.entries(base.listas.formas).map(([v, t]) => ({ v, t }))} valor={cob.forma_cobranca} onChange={(v) => setCob((c) => ({ ...c, forma_cobranca: v || "bolepix" }))} />
                        </div>
                        <div>
                            <span className={ROTULO}>Dia de pagamento</span>
                            <Combo rotulo="Dia de pagamento" opcoes={base.listas.dias.map((d) => ({ v: d, t: "Dia " + d }))} valor={cob.dia_pagamento} onChange={(v) => setCob((c) => ({ ...c, dia_pagamento: v || 10 }))} />
                        </div>
                        <div>
                            <span className={ROTULO}>1ª mensalidade</span>
                            <Combo
                                rotulo="1ª mensalidade"
                                opcoes={[
                                    { v: 0, t: "Mês seguinte" },
                                    { v: 15, t: "Adiar 15 dias" },
                                    { v: 30, t: "Adiar 30 dias" },
                                ]}
                                valor={cob.adiar_dias}
                                onChange={(v) => setCob((c) => ({ ...c, adiar_dias: v ?? 0 }))}
                            />
                        </div>
                        <div>
                            <span className={ROTULO}>Vendedor</span>
                            <Combo rotulo="Vendedor" placeholder="Digite o nome do colaborador" opcoes={base.colaboradores.map((u) => ({ v: u.id, t: u.nome }))} valor={cob.vendedor_usuario_id} onChange={(v) => setCob((c) => ({ ...c, vendedor_usuario_id: v }))} />
                            <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Recebe a adesão (100%) na comissão quando ela for paga.</span>
                        </div>
                        <div>
                            <span className={ROTULO}>Origem da venda</span>
                            <Combo rotulo="Origem da venda" opcoes={Object.entries(base.listas.origens).map(([v, t]) => ({ v, t }))} valor={cob.origem} onChange={(v) => setCob((c) => ({ ...c, origem: v }))} />
                        </div>
                        <div>
                            <span className={ROTULO}>Indicado por (opcional)</span>
                            <Combo rotulo="Indicado por" placeholder="Nome do titular ou nº do contrato" opcoes={indicadores} valor={cob.indicador} onChange={(v) => setCob((c) => ({ ...c, indicador: v }))} onTexto={procurarIndicador} vazio="Ninguém" />
                        </div>
                        <div>
                            <span className={ROTULO}>Responsável pelo pagamento</span>
                            <Combo
                                rotulo="Responsável pelo pagamento"
                                opcoes={[
                                    { v: "titular", t: "O próprio titular" },
                                    { v: "outro", t: "Outra pessoa", s: "CPF no cadastro único" },
                                ]}
                                valor={cob.responsavel}
                                onChange={(v) => setCob((c) => ({ ...c, responsavel: (v as "titular" | "outro") || "titular" }))}
                            />
                        </div>
                        {cob.responsavel === "outro" ? (
                            <>
                                <CampoCpf valor={cob.responsavel_cpf} onChange={(v) => setCob((c) => ({ ...c, responsavel_cpf: v }))} rotulo="CPF do responsável" rotuloCls={ROTULO} />
                                <label className="block">
                                    <span className={ROTULO}>Nome do responsável</span>
                                    <input className="h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]" value={cob.responsavel_nome} onChange={(e) => setCob((c) => ({ ...c, responsavel_nome: e.target.value }))} />
                                </label>
                            </>
                        ) : null}
                    </div>
                    <div className={NOTA}>
                        <span>&quot;Indicado por&quot; liga o contrato novo ao de quem indicou: é a base da bonificação por indicação (o pedido vai para a Gestão). O &quot;Responsável pelo pagamento&quot; é quem recebe a cobrança quando não é o titular.</span>
                    </div>
                </>
            ) : null}

            {passo === 4 ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            ["Titular", t.nome || "—"],
                            ["Plano", plano?.nome || "—"],
                            ["Beneficiários", `Titular + ${benef.length}`],
                            ["Sucessor", suc?.nome || "Não indicado"],
                        ].map(([l, v]) => (
                            <div key={l}>
                                <span className={ROTULO}>{l}</span>
                                <div className="min-h-11 rounded-xl bg-[#F1F4F8] px-3 py-2.5 font-bold dark:bg-[#1C2334]">{v}</div>
                            </div>
                        ))}
                    </div>
                    {resumo}
                    {problemas.slice(0, 4).some((p) => p.length) ? (
                        <div className="rounded-xl bg-[#FCF3CC] px-4 py-3 text-[14px] font-bold text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                            {problemas.slice(0, 4).map((p, i) => (p.length ? <div key={i}>{PASSOS[i]}: falta {p.join(", ")}.</div> : null))}
                        </div>
                    ) : null}
                    <div className={NOTA}>
                        <span>&quot;Salvar pré-cadastro&quot; grava o contrato e o número (até a virada, números de teste a partir de 900001). Ele vira <b>Ativo</b> quando a adesão é paga, e a carência conta dessa data.</span>
                    </div>
                </>
            ) : null}

            {passo > 0 && passo < 4 && calc ? <div className="lg:hidden">{resumo}</div> : null}

            <div className="flex flex-wrap justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                {passo > 0 ? (
                    <button type="button" className={BTN_SEC} onClick={() => setPasso((p) => p - 1)}>
                        Voltar
                    </button>
                ) : null}
                {passo < 4 ? (
                    <button type="button" className={BTN_PRI} onClick={() => setPasso((p) => p + 1)}>
                        Avançar
                    </button>
                ) : (
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                        {salvando ? "Salvando…" : "Salvar pré-cadastro"}
                    </button>
                )}
            </div>

            {editando ? (
                <JanelaBenef
                    titulo={editando.nome ? `Beneficiário: ${editando.nome}` : editando.tipo === "pet" ? "Novo pet" : "Novo beneficiário"}
                    inicial={editando}
                    base={base}
                    temExtra={!!extraItem}
                    nascimentoObrig={nascObrig}
                    onFechar={() => setEditando(null)}
                    onSalvar={(b) => {
                        setBenef((l) => (l.some((x) => x.chave === b.chave) ? l.map((x) => (x.chave === b.chave ? b : x)) : [...l, b]));
                        setEditando(null);
                    }}
                />
            ) : null}
        </div>
    );
}
