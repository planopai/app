"use client";

/**
 * Planos (/contratos-planos, chave contratos-planos) · módulo Contratos — 18/11/2026. Back-end: pl_planos.php.
 * Fase 1 (prévia aprovada em 18/11/2026): lista dos planos e a ficha com as abas Cadastro, Preços (tabela por vigência;
 * FLEX com faixas pela pessoa mais velha), Regras (uma vaga por tipo), Aditivos e benefícios e Documentos.
 * Contratos e beneficiários entram na fase 2.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconListDetails, IconPencil, IconPlus } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import {
    BTN_PEQ,
    BTN_PEQ_PRI,
    BTN_PRI,
    BTN_SEC,
    CAMPO,
    CAMPO_P,
    CARTAO,
    dataBR,
    ERRO,
    hojeISO,
    Janela,
    NOTA,
    numCampo,
    paraNumero,
    ROTULO,
    S_AVISO,
    S_MUDO,
    S_OK,
    SELO,
    SUB,
    useAviso,
} from "../contas-pagar/components/fin";
import {
    type Dados,
    type Gravar,
    type ItemPreco,
    type Plano,
    type Tabela,
    SeloPlano,
    SeloRegra,
    SIT_PLANO,
    TIPO_PRECO,
    useDados,
    useGravar,
    versaoAtual,
} from "./components/pl";

type Sub = "cadastro" | "precos" | "regras" | "aditivos" | "documentos";
const SUBS: [Sub, string][] = [
    ["cadastro", "Cadastro"],
    ["precos", "Preços"],
    ["regras", "Regras"],
    ["aditivos", "Aditivos e benefícios"],
    ["documentos", "Documentos"],
];

export default function Page() {
    const { dados, erro, recarregar } = useDados();
    const { avisar, aviso } = useAviso();
    const gravar = useGravar(avisar, recarregar);
    const [sel, setSel] = useState<number | null>(null);
    const [verFicha, setVerFicha] = useState(false); // celular: lista ou ficha
    const [sub, setSub] = useState<Sub>("cadastro");
    const [novo, setNovo] = useState(false);

    useEffect(() => {
        if (dados && (sel === null || !dados.planos.some((p) => p.id === sel)) && dados.planos.length) setSel(dados.planos[0].id);
    }, [dados, sel]);

    const plano = dados?.planos.find((p) => p.id === sel) ?? null;
    const grupos: [string, Plano[]][] = dados
        ? ([
              ["À venda", dados.planos.filter((p) => p.situacao === "vende")],
              ["Fora de venda", dados.planos.filter((p) => p.situacao === "fora_venda")],
              ["Inativos", dados.planos.filter((p) => p.situacao === "inativo")],
          ] as [string, Plano[]][]).filter(([, l]) => l.length)
        : [];

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconListDetails}
                    titulo="Planos"
                    acoes={
                        dados?.pode_planos ? (
                            <button type="button" className={BTN_PRI} onClick={() => setNovo(true)}>
                                <IconPlus size={18} /> Novo plano
                            </button>
                        ) : null
                    }
                />
                <div className={SUB}>Contratos › Configurações › Planos</div>
                {erro ? <div className={ERRO}>{erro}</div> : null}
                {!dados && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
                {dados ? (
                    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <nav className={`${CARTAO} h-fit overflow-hidden ${verFicha ? "hidden lg:block" : ""}`} aria-label="Planos">
                            {grupos.map(([g, lista]) => (
                                <div key={g}>
                                    <div className="px-4 pb-1 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">{g}</div>
                                    {lista.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            aria-current={p.id === sel}
                                            onClick={() => {
                                                setSel(p.id);
                                                setVerFicha(true);
                                            }}
                                            className={`flex min-h-[56px] w-full flex-col items-start gap-1 border-t border-[#EEF2F7] px-4 py-2.5 text-left dark:border-white/[0.06] ${
                                                p.id === sel ? "bg-[#E9EFF6] shadow-[inset_3px_0_0_#F2CB3F] dark:bg-[#3D6A99]/20" : ""
                                            }`}
                                        >
                                            <b className="text-[15px]">{p.nome}</b>
                                            <SeloPlano p={p} />
                                        </button>
                                    ))}
                                </div>
                            ))}
                            {!dados.planos.length ? <div className="p-4 text-[14px] text-[#5B6478]">Nenhum plano cadastrado.</div> : null}
                        </nav>
                        <section className={`${CARTAO} flex min-w-0 flex-col gap-4 p-4 md:p-5 ${verFicha ? "" : "hidden lg:flex"}`}>
                            {plano ? (
                                <>
                                    <button type="button" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[14px] font-extrabold lg:hidden" onClick={() => setVerFicha(false)}>
                                        <IconChevronLeft size={18} /> Planos
                                    </button>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-[22px] font-extrabold leading-tight">{plano.nome}</h2>
                                            <SeloPlano p={plano} />
                                        </div>
                                        {plano.descricao ? <p className="mt-1 text-[14.5px] text-[#5B6478] dark:text-[#AEB9CF]">{plano.descricao}</p> : null}
                                    </div>
                                    <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] px-4 dark:border-white/[0.1] md:-mx-5 md:px-5" role="tablist">
                                        {SUBS.map(([k, r]) => (
                                            <button
                                                key={k}
                                                type="button"
                                                role="tab"
                                                aria-selected={sub === k}
                                                onClick={() => setSub(k)}
                                                className={`h-11 shrink-0 whitespace-nowrap px-3 text-[14.5px] ${sub === k ? "font-extrabold shadow-[inset_0_-3px_0_#F2CB3F]" : "font-bold text-[#5B6478] dark:text-[#AEB9CF]"}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                    {sub === "cadastro" ? <AbaCadastro p={plano} pode={dados.pode_planos} gravar={gravar} /> : null}
                                    {sub === "precos" ? <AbaPrecos p={plano} pode={dados.pode_planos} gravar={gravar} /> : null}
                                    {sub === "regras" ? <AbaRegras p={plano} dados={dados} gravar={gravar} /> : null}
                                    {sub === "aditivos" ? <AbaAditivos p={plano} dados={dados} gravar={gravar} /> : null}
                                    {sub === "documentos" ? <AbaDocumentos p={plano} pode={dados.pode_planos} gravar={gravar} /> : null}
                                </>
                            ) : (
                                <div className="py-8 text-center text-[#5B6478]">Escolha um plano na lista.</div>
                            )}
                        </section>
                    </div>
                ) : null}
            </div>
            {novo ? (
                <FormPlano
                    onFechar={() => setNovo(false)}
                    gravar={gravar}
                    onCriado={(id) => {
                        setSel(id);
                        setVerFicha(true);
                        setSub("precos");
                    }}
                />
            ) : null}
            {aviso}
        </div>
    );
}

/* ============================== cadastro ============================== */

function Info({ r, v }: { r: string; v: React.ReactNode }) {
    return (
        <div className="rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 dark:bg-[#1C2334]">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{r}</div>
            <div className="mt-0.5 break-words text-[14.5px] font-bold">{v === null || v === undefined || v === "" ? "—" : v}</div>
        </div>
    );
}

function AbaCadastro({ p, pode, gravar }: { p: Plano; pode: boolean; gravar: Gravar }) {
    const [editar, setEditar] = useState(false);
    return (
        <>
            <div className="grid gap-2.5 sm:grid-cols-2">
                <Info r="Situação" v={SIT_PLANO[p.situacao]} />
                <Info r="Preço" v={TIPO_PRECO[p.tipo_preco]} />
                <Info r="Área de negócio" v={p.area_negocio} />
                <Info r="Urna" v={p.urna} />
                <Info r="Translado" v={p.translado_texto || (p.translado_km === null ? "Sem limite de km" : `Até ${p.translado_km.toLocaleString("pt-BR")} km`)} />
                <Info r="Tanatopraxia" v={p.tanatopraxia} />
                <Info r="Telemedicina" v={p.telemedicina} />
                <Info r="Vigência" v={p.vigencia_meses ? `${p.vigencia_meses} meses${p.renovacao_automatica ? ", renovação automática" : ""}` : null} />
                <Info r="Aceita aditivos" v={p.aceita_aditivo ? "Sim" : "Não"} />
                <Info r="Aceita troca de titular" v={p.aceita_troca_titular ? "Sim" : "Não"} />
                {p.coberturas_unymos ? <Info r="Coberturas da Unymos ligadas" v={p.coberturas_unymos} /> : null}
            </div>
            {pode ? (
                <button type="button" className={`${BTN_PEQ} self-start`} onClick={() => setEditar(true)}>
                    <IconPencil size={16} /> Editar cadastro
                </button>
            ) : null}
            {editar ? <FormPlano p={p} onFechar={() => setEditar(false)} gravar={gravar} /> : null}
        </>
    );
}

type FormP = {
    nome: string;
    descricao: string;
    situacao: Plano["situacao"];
    ordem: string;
    tipo_preco: Plano["tipo_preco"];
    area_negocio: string;
    urna: string;
    translado_km: string;
    translado_texto: string;
    tanatopraxia: string;
    telemedicina: string;
    vigencia_meses: string;
    renovacao_automatica: boolean;
    aceita_aditivo: boolean;
    aceita_troca_titular: boolean;
};

function FormPlano({ p, onFechar, gravar, onCriado }: { p?: Plano; onFechar: () => void; gravar: Gravar; onCriado?: (id: number) => void }) {
    const [v, setV] = useState<FormP>({
        nome: p?.nome ?? "",
        descricao: p?.descricao ?? "",
        situacao: p?.situacao ?? "vende",
        ordem: String(p?.ordem ?? 0),
        tipo_preco: p?.tipo_preco ?? "simples",
        area_negocio: p?.area_negocio ?? "Plano · Mensalidades",
        urna: p?.urna ?? "",
        translado_km: p?.translado_km === null || p?.translado_km === undefined ? "" : String(p.translado_km),
        translado_texto: p?.translado_texto ?? "",
        tanatopraxia: p?.tanatopraxia ?? "",
        telemedicina: p?.telemedicina ?? "",
        vigencia_meses: p?.vigencia_meses ? String(p.vigencia_meses) : "48",
        renovacao_automatica: p?.renovacao_automatica ?? true,
        aceita_aditivo: p?.aceita_aditivo ?? false,
        aceita_troca_titular: p?.aceita_troca_titular ?? true,
    });
    const [ocupado, setOcupado] = useState(false);
    const set = (x: Partial<FormP>) => setV((a) => ({ ...a, ...x }));
    const txt = (k: keyof FormP, r: string, extra = "") => (
        <div className={extra}>
            <label className={ROTULO}>{r}</label>
            <input className={CAMPO} value={String(v[k])} onChange={(e) => set({ [k]: e.target.value } as Partial<FormP>)} />
        </div>
    );
    const sim = (k: "renovacao_automatica" | "aceita_aditivo" | "aceita_troca_titular", r: string) => (
        <div>
            <label className={ROTULO}>{r}</label>
            <select className={CAMPO} value={v[k] ? "1" : "0"} onChange={(e) => set({ [k]: e.target.value === "1" } as Partial<FormP>)}>
                <option value="1">Sim</option>
                <option value="0">Não</option>
            </select>
        </div>
    );
    return (
        <Janela
            titulo={p ? `Editar ${p.nome}` : "Novo plano"}
            sub={p ? undefined : "O plano nasce sem preço e sem regras: cadastre depois na ficha."}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("plano", { ...v, id: p?.id, translado_km: v.translado_km === "" ? null : v.translado_km, vigencia_meses: v.vigencia_meses || null });
                            setOcupado(false);
                            if (j) {
                                onFechar();
                                if (!p && onCriado && j.dados?.id) onCriado(j.dados.id);
                            }
                        }}
                    >
                        {ocupado ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                {txt("nome", "Nome")}
                <div>
                    <label className={ROTULO}>Situação</label>
                    <select className={CAMPO} value={v.situacao} onChange={(e) => set({ situacao: e.target.value as Plano["situacao"] })}>
                        {Object.entries(SIT_PLANO).map(([k, r]) => (
                            <option key={k} value={k}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>
                {txt("descricao", "Descrição", "sm:col-span-2")}
                <div>
                    <label className={ROTULO}>Preço</label>
                    <select className={CAMPO} value={v.tipo_preco} onChange={(e) => set({ tipo_preco: e.target.value as Plano["tipo_preco"] })}>
                        {Object.entries(TIPO_PRECO).map(([k, r]) => (
                            <option key={k} value={k}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>
                {txt("area_negocio", "Área de negócio")}
                {txt("urna", "Urna")}
                <div>
                    <label className={ROTULO}>Translado (km; vazio = sem limite)</label>
                    <input className={CAMPO} inputMode="numeric" value={v.translado_km} onChange={(e) => set({ translado_km: e.target.value.replace(/\D/g, "") })} />
                </div>
                {txt("translado_texto", "Translado (como aparece)")}
                {txt("tanatopraxia", "Tanatopraxia")}
                {txt("telemedicina", "Telemedicina")}
                <div>
                    <label className={ROTULO}>Vigência (meses)</label>
                    <input className={CAMPO} inputMode="numeric" value={v.vigencia_meses} onChange={(e) => set({ vigencia_meses: e.target.value.replace(/\D/g, "") })} />
                </div>
                {sim("renovacao_automatica", "Renovação automática")}
                {sim("aceita_aditivo", "Aceita aditivos")}
                {sim("aceita_troca_titular", "Aceita troca de titular")}
                <div>
                    <label className={ROTULO}>Ordem na lista</label>
                    <input className={CAMPO} inputMode="numeric" value={v.ordem} onChange={(e) => set({ ordem: e.target.value.replace(/\D/g, "") })} />
                </div>
            </div>
        </Janela>
    );
}

/* ============================== preços ============================== */

const ESTADO_TAB: Record<Tabela["estado"], [string, string]> = { vigente: ["Vigente", S_OK], futura: ["A partir da data", S_AVISO], encerrada: ["Encerrada", S_MUDO] };

function faixaTexto(i: ItemPreco) {
    if (i.idade_ini === null && i.idade_fim === null) return "";
    if (i.idade_fim === null) return `${i.idade_ini} anos ou mais`;
    if (!i.idade_ini) return `Até ${i.idade_fim} anos completos`;
    return `${i.idade_ini} a ${i.idade_fim} anos`;
}

function quemTexto(p: Plano, i: ItemPreco) {
    if (i.tipo === "extra") {
        const partes = ["Beneficiário extra"];
        if (i.qtd_sem_custo) partes.push(`a partir do ${i.qtd_sem_custo + 1}º`);
        if (i.qtd_max) partes.push(`até ${i.qtd_max}`);
        return partes.join(", ");
    }
    const f = faixaTexto(i);
    return p.tipo_preco === "faixas" && f ? `Pessoa mais velha: ${f}` : `Titular${f ? ` (${f})` : ""}`;
}

function AbaPrecos({ p, pode, gravar }: { p: Plano; pode: boolean; gravar: Gravar }) {
    const [form, setForm] = useState<Tabela | "nova" | null>(null);
    if (p.tipo_preco === "contrato")
        return (
            <div className={NOTA}>
                Cada contrato guarda o próprio valor (planos antigos). O reajuste no aniversário segue a regra de Reajuste. Para vender com tabela, mude o preço no Cadastro.
            </div>
        );
    return (
        <>
            {!p.tabelas.length ? <div className={NOTA}>Nenhuma tabela de preço ainda.</div> : null}
            {p.tabelas.map((t) => (
                <div key={t.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`${SELO} ${ESTADO_TAB[t.estado][1]}`}>{ESTADO_TAB[t.estado][0]}</span>
                        <b className="text-[15px]">{t.nome}</b>
                        <span className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                            · de {dataBR(t.vale_desde)}
                            {t.vale_ate ? ` até ${dataBR(t.vale_ate)}` : ""}
                        </span>
                        {pode && t.estado !== "encerrada" ? (
                            <button type="button" className={`${BTN_PEQ} ml-auto`} onClick={() => setForm(t)}>
                                <IconPencil size={16} /> Corrigir
                            </button>
                        ) : null}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.1]">
                        <table className="w-full text-[14px] sm:text-[14.5px]">
                            <thead>
                                <tr className="bg-[#F6F8FB] text-left text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    <th className="px-3 py-2">Quem</th>
                                    <th className="px-3 py-2 text-right">Adesão</th>
                                    <th className="px-3 py-2 text-right">Mensalidade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {t.itens.map((i, n) => (
                                    <tr key={n} className="border-t border-[#EEF2F7] dark:border-white/[0.06]">
                                        <td className="px-3 py-2">{quemTexto(p, i)}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{i.valor_adesao ? `R$ ${numCampo(i.valor_adesao)}` : "—"}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                            R$ {numCampo(i.valor_mensal)}
                                            {i.percentual_mensal ? <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]"> ({numCampo(i.percentual_mensal)}%)</span> : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
            {pode ? (
                <button type="button" className={`${BTN_PEQ_PRI} self-start`} onClick={() => setForm("nova")}>
                    <IconPlus size={16} /> Nova tabela de preço
                </button>
            ) : null}
            <div className={NOTA}>
                Cada tabela tem data de início. A nova vale para os contratos feitos a partir dela; os contratos em vigor mudam só no aniversário, pela regra de Reajuste. A tabela anterior fica no histórico.
            </div>
            {form ? <FormTabela p={p} t={form === "nova" ? null : form} onFechar={() => setForm(null)} gravar={gravar} /> : null}
        </>
    );
}

type LinhaF = { tipo: "titular" | "extra"; idade_ini: string; idade_fim: string; valor_adesao: string; valor_mensal: string; percentual_mensal: string; qtd_sem_custo: string; qtd_max: string };
const paraLinha = (i: ItemPreco): LinhaF => ({
    tipo: i.tipo,
    idade_ini: i.idade_ini === null ? "" : String(i.idade_ini),
    idade_fim: i.idade_fim === null ? "" : String(i.idade_fim),
    valor_adesao: numCampo(i.valor_adesao),
    valor_mensal: numCampo(i.valor_mensal),
    percentual_mensal: i.percentual_mensal === null ? "" : numCampo(i.percentual_mensal),
    qtd_sem_custo: String(i.qtd_sem_custo || ""),
    qtd_max: i.qtd_max === null ? "" : String(i.qtd_max),
});
const linhaNova = (tipo: "titular" | "extra"): LinhaF => ({ tipo, idade_ini: "", idade_fim: "", valor_adesao: "", valor_mensal: "", percentual_mensal: tipo === "extra" ? "20" : "", qtd_sem_custo: "", qtd_max: "" });

function FormTabela({ p, t, onFechar, gravar }: { p: Plano; t: Tabela | null; onFechar: () => void; gravar: Gravar }) {
    const base = t ?? p.tabelas.find((x) => x.estado === "vigente") ?? null; // nova tabela parte da vigente
    const [nome, setNome] = useState(t?.nome ?? `Tabela ${p.nome} ${dataBR(hojeISO())}`);
    const [desde, setDesde] = useState(t?.vale_desde ?? hojeISO());
    const [linhas, setLinhas] = useState<LinhaF[]>(base ? base.itens.map(paraLinha) : [linhaNova("titular")]);
    const [ocupado, setOcupado] = useState(false);
    const muda = (n: number, x: Partial<LinhaF>) => setLinhas((l) => l.map((y, i) => (i === n ? { ...y, ...x } : y)));
    const titularMensal = useMemo(() => paraNumero(linhas.find((l) => l.tipo === "titular")?.valor_mensal ?? "") || 0, [linhas]);
    const faixas = p.tipo_preco === "faixas";
    return (
        <Janela
            titulo={t ? `Corrigir ${t.nome}` : "Nova tabela de preço"}
            sub={t ? "A correção muda a tabela no lugar. Use só para erro de digitação." : "Começa com os valores da tabela vigente. A vigente passa a valer até o dia anterior."}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("tabela", {
                                id: t?.id,
                                plano_id: p.id,
                                nome,
                                vale_desde: desde,
                                itens: linhas.map((l) => ({
                                    tipo: l.tipo,
                                    idade_ini: l.idade_ini === "" ? null : l.idade_ini,
                                    idade_fim: l.idade_fim === "" ? null : l.idade_fim,
                                    valor_adesao: l.valor_adesao || 0,
                                    valor_mensal: l.valor_mensal || 0,
                                    percentual_mensal: l.percentual_mensal || null,
                                    qtd_sem_custo: l.qtd_sem_custo || 0,
                                    qtd_max: l.qtd_max === "" ? null : l.qtd_max,
                                })),
                            });
                            setOcupado(false);
                            if (j) onFechar();
                        }}
                    >
                        {ocupado ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                    <label className={ROTULO}>Nome</label>
                    <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Vale a partir de</label>
                    <input type="date" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
            </div>
            {linhas.map((l, n) => (
                <div key={n} className="flex flex-col gap-2.5 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.1]">
                    <div className="flex items-center gap-2">
                        <b className="text-[14.5px]">{l.tipo === "extra" ? "Beneficiário extra" : faixas ? `Faixa ${n + 1}` : "Titular"}</b>
                        <button type="button" className="ml-auto min-h-11 px-2 text-[13.5px] font-extrabold text-[#B42318] dark:text-[#FF9C92]" onClick={() => setLinhas((x) => x.filter((_, i) => i !== n))}>
                            Tirar
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {l.tipo === "titular" && faixas ? (
                            <>
                                <div>
                                    <label className={ROTULO}>Idade de</label>
                                    <input className={CAMPO_P} inputMode="numeric" value={l.idade_ini} onChange={(e) => muda(n, { idade_ini: e.target.value.replace(/\D/g, "") })} />
                                </div>
                                <div>
                                    <label className={ROTULO}>Até (vazio = sem fim)</label>
                                    <input className={CAMPO_P} inputMode="numeric" value={l.idade_fim} onChange={(e) => muda(n, { idade_fim: e.target.value.replace(/\D/g, "") })} />
                                </div>
                            </>
                        ) : null}
                        {l.tipo === "titular" ? (
                            <div>
                                <label className={ROTULO}>Adesão (R$)</label>
                                <input className={CAMPO_P} inputMode="decimal" value={l.valor_adesao} onChange={(e) => muda(n, { valor_adesao: e.target.value })} />
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className={ROTULO}>% da mensalidade</label>
                                    <input
                                        className={CAMPO_P}
                                        inputMode="decimal"
                                        value={l.percentual_mensal}
                                        onChange={(e) => {
                                            const pc = paraNumero(e.target.value) || 0;
                                            muda(n, { percentual_mensal: e.target.value, valor_mensal: pc && titularMensal ? numCampo(Math.ceil(titularMensal * pc) / 100) : l.valor_mensal });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className={ROTULO}>Sem custo (quantos)</label>
                                    <input className={CAMPO_P} inputMode="numeric" value={l.qtd_sem_custo} onChange={(e) => muda(n, { qtd_sem_custo: e.target.value.replace(/\D/g, "") })} />
                                </div>
                                <div>
                                    <label className={ROTULO}>Máximo de extras</label>
                                    <input className={CAMPO_P} inputMode="numeric" value={l.qtd_max} onChange={(e) => muda(n, { qtd_max: e.target.value.replace(/\D/g, "") })} />
                                </div>
                            </>
                        )}
                        <div>
                            <label className={ROTULO}>Mensalidade (R$)</label>
                            <input className={CAMPO_P} inputMode="decimal" value={l.valor_mensal} onChange={(e) => muda(n, { valor_mensal: e.target.value })} />
                        </div>
                    </div>
                </div>
            ))}
            <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PEQ} onClick={() => setLinhas((x) => [...x, linhaNova("titular")])}>
                    <IconPlus size={16} /> {faixas ? "Faixa de idade" : "Linha do titular"}
                </button>
                <button type="button" className={BTN_PEQ} onClick={() => setLinhas((x) => [...x, linhaNova("extra")])}>
                    <IconPlus size={16} /> Beneficiário extra
                </button>
            </div>
            {faixas ? <div className={NOTA}>A faixa é escolhida pelo sistema pela idade, em anos completos, da pessoa mais velha do contrato (o pet não conta).</div> : null}
        </Janela>
    );
}

/* ============================== regras do plano ============================== */

function AbaRegras({ p, dados, gravar }: { p: Plano; dados: Dados; gravar: Gravar }) {
    const pode = dados.pode_planos;
    const [criar, setCriar] = useState<string | null>(null);
    const nomeTipo = (k: string) => dados.tipos.find((t) => t.k === k)?.nome ?? k;
    return (
        <>
            <div className={NOTA}>
                <span>
                    Uma vaga para cada tipo de regra. A mesma regra pode servir a vários planos.
                    {p.situacao === "vende" ? " O plano só fica Pronto para vender com todas as obrigatórias preenchidas e aprovadas, e com preço vigente." : ""}
                </span>
            </div>
            {p.situacao === "vende" && p.faltam.length ? <div className={`${NOTA} !bg-[#FDECEA] !text-[#B42318] dark:!bg-[#FF9C92]/10 dark:!text-[#FF9C92]`}>Faltam: {p.faltam.map(nomeTipo).join(", ")}.</div> : null}
            <div className="grid gap-3 md:grid-cols-2">
                {dados.tipos.map((t) => {
                    const rid = p.vagas[t.k];
                    const r = rid ? dados.regras.find((x) => x.id === rid) : null;
                    const v = r ? versaoAtual(r) : null;
                    const opcoes = dados.regras.filter((x) => x.tipo === t.k && (x.situacao !== "inativa" || x.id === rid));
                    return (
                        <div key={t.k} className={`flex flex-col gap-2 rounded-xl border p-3 ${!rid && t.obrigatoria && p.situacao === "vende" ? "border-[#F4B4AC] dark:border-[#FF9C92]/40" : "border-[#E3E8F0] dark:border-white/[0.1]"}`}>
                            <div className="flex items-center gap-2">
                                <b className="text-[14.5px]">{t.nome}</b>
                                <span className={`${SELO} ${t.obrigatoria ? "bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]" : S_MUDO}`}>{t.obrigatoria ? "Obrigatória" : "Opcional"}</span>
                            </div>
                            <select
                                className={CAMPO_P}
                                aria-label={`Regra de ${t.nome}`}
                                disabled={!pode}
                                value={rid ?? ""}
                                onChange={(e) => void gravar("vaga", { plano_id: p.id, tipo: t.k, regra_id: e.target.value ? Number(e.target.value) : null })}
                            >
                                <option value="">— Sem regra —</option>
                                {opcoes.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.nome}
                                    </option>
                                ))}
                            </select>
                            {r ? (
                                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    <SeloRegra s={r.situacao} />
                                    {v ? `v${v.versao} · desde ${dataBR(v.vale_desde)}` : null}
                                </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                {r ? (
                                    <Link href={`/contratos-regras?regra=${r.id}`} className={BTN_PEQ}>
                                        Abrir a regra
                                    </Link>
                                ) : null}
                                {pode && dados.pode_regras ? (
                                    <button type="button" className={BTN_PEQ} onClick={() => setCriar(t.k)}>
                                        Criar nova
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
            {criar ? <CriarRegraDoPlano p={p} tipo={criar} nomeTipo={nomeTipo(criar)} onFechar={() => setCriar(null)} gravar={gravar} /> : null}
        </>
    );
}

function CriarRegraDoPlano({ p, tipo, nomeTipo, onFechar, gravar }: { p: Plano; tipo: string; nomeTipo: string; onFechar: () => void; gravar: Gravar }) {
    const [nome, setNome] = useState(`${nomeTipo} ${p.nome}`);
    const [ocupado, setOcupado] = useState(false);
    return (
        <Janela
            titulo={`Nova regra de ${nomeTipo.toLowerCase()}`}
            sub={`Ao criar, já fica na vaga do ${p.nome}. Depois você preenche os campos na tela Regras.`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("regra", { tipo, nome, plano_id: p.id, parametros: {} });
                            setOcupado(false);
                            if (j?.dados?.id) window.location.href = `/contratos-regras?regra=${j.dados.id}&editar=1`;
                        }}
                    >
                        {ocupado ? "Criando…" : "Criar e preencher"}
                    </button>
                </>
            }
        >
            <div>
                <label className={ROTULO}>Nome da regra</label>
                <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
        </Janela>
    );
}

/* ============================== aditivos ============================== */

function AbaAditivos({ p, dados, gravar }: { p: Plano; dados: Dados; gravar: Gravar }) {
    const pode = dados.pode_planos;
    const inicial = () => Object.fromEntries(p.aditivos.map((a) => [a.aditivo_id, a.condicao ?? ""])) as Record<number, string>;
    const [marc, setMarc] = useState<Record<number, string>>(inicial);
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        setMarc(inicial());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.id, p.aditivos]);
    return (
        <>
            <div className="flex flex-col divide-y divide-[#EEF2F7] dark:divide-white/[0.06]">
                {dados.aditivos.map((a) => {
                    const on = a.id in marc;
                    return (
                        <div key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 shrink-0 accent-[#313C55]"
                                    disabled={!pode}
                                    checked={on}
                                    onChange={(e) =>
                                        setMarc((m) => {
                                            const n = { ...m };
                                            if (e.target.checked) n[a.id] = "";
                                            else delete n[a.id];
                                            return n;
                                        })
                                    }
                                />
                                <span className="min-w-0">
                                    <b className="block text-[15px]">{a.nome}</b>
                                    {a.descricao ? <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{a.descricao}</span> : null}
                                </span>
                            </label>
                            {on ? (
                                <input
                                    className={`${CAMPO_P} sm:!w-80`}
                                    placeholder="Condição (incluído, contratável, sem custo…)"
                                    disabled={!pode}
                                    value={marc[a.id]}
                                    onChange={(e) => setMarc((m) => ({ ...m, [a.id]: e.target.value }))}
                                    aria-label={`Condição de ${a.nome}`}
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {pode ? (
                <button
                    type="button"
                    className={`${BTN_PEQ_PRI} self-start`}
                    disabled={ocupado}
                    onClick={async () => {
                        setOcupado(true);
                        await gravar("aditivos", { plano_id: p.id, itens: Object.entries(marc).map(([id, c]) => ({ aditivo_id: Number(id), condicao: c })) });
                        setOcupado(false);
                    }}
                >
                    {ocupado ? "Salvando…" : "Salvar aditivos"}
                </button>
            ) : null}
            <div className={NOTA}>Aqui fica só o que vale para cada plano. Preço e carência de cada aditivo e a contratação no contrato entram na fase 2; a cobrança, na fase 3.</div>
        </>
    );
}

/* ============================== documentos ============================== */

const TIPOS_DOC: [string, string][] = [
    ["termo_adesao", "Termo de adesão"],
    ["termo_aditivo", "Termo aditivo"],
    ["inclusao_beneficiario", "Inclusão de beneficiário"],
    ["cancelamento", "Cancelamento"],
    ["transferencia", "Transferência"],
    ["outro", "Outro"],
];

function AbaDocumentos({ p, pode, gravar }: { p: Plano; pode: boolean; gravar: Gravar }) {
    const [form, setForm] = useState<Plano["documentos"][number] | "novo" | null>(null);
    const nomeTipo = (k: string) => TIPOS_DOC.find(([x]) => x === k)?.[1] ?? k;
    return (
        <>
            {p.documentos.length ? (
                <div className="flex flex-col divide-y divide-[#EEF2F7] rounded-xl border border-[#E3E8F0] dark:divide-white/[0.06] dark:border-white/[0.1]">
                    {p.documentos.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <b className="block break-words text-[14.5px]">{d.nome}</b>
                                <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    {nomeTipo(d.tipo)}
                                    {d.vale_desde ? ` · desde ${dataBR(d.vale_desde)}` : ""}
                                </span>
                            </div>
                            {pode ? (
                                <button type="button" className={BTN_PEQ} onClick={() => setForm(d)}>
                                    <IconPencil size={16} /> Editar
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                <div className={NOTA}>Nenhum documento ligado a este plano.</div>
            )}
            {pode ? (
                <button type="button" className={`${BTN_PEQ_PRI} self-start`} onClick={() => setForm("novo")}>
                    <IconPlus size={16} /> Documento
                </button>
            ) : null}
            <div className={NOTA}>Aqui fica só quais termos valem para o plano. O modelo com os campos do contrato e a assinatura eletrônica entram na fase 5.</div>
            {form ? <FormDocumento p={p} d={form === "novo" ? null : form} onFechar={() => setForm(null)} gravar={gravar} /> : null}
        </>
    );
}

function FormDocumento({ p, d, onFechar, gravar }: { p: Plano; d: Plano["documentos"][number] | null; onFechar: () => void; gravar: Gravar }) {
    const [tipo, setTipo] = useState(d?.tipo ?? "termo_adesao");
    const [nome, setNome] = useState(d?.nome ?? "");
    const [desde, setDesde] = useState(d?.vale_desde ?? "");
    const [ocupado, setOcupado] = useState(false);
    const salvar = async (remover = false) => {
        setOcupado(true);
        const j = await gravar("documento", { id: d?.id, plano_id: p.id, tipo, nome, vale_desde: desde || null, remover });
        setOcupado(false);
        if (j) onFechar();
    };
    return (
        <Janela
            titulo={d ? "Editar documento" : "Novo documento"}
            onFechar={onFechar}
            rodape={
                <>
                    {d ? (
                        <button type="button" className={BTN_SEC} disabled={ocupado} onClick={() => void salvar(true)}>
                            Tirar do plano
                        </button>
                    ) : null}
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void salvar()}>
                        {ocupado ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                    <label className={ROTULO}>Tipo</label>
                    <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        {TIPOS_DOC.map(([k, r]) => (
                            <option key={k} value={k}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={ROTULO}>Vale a partir de</label>
                    <input type="date" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <label className={ROTULO}>Nome</label>
                    <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Termo de Adesão LIGHT (jurídico, 02/10/2026)" />
                </div>
            </div>
        </Janela>
    );
}
