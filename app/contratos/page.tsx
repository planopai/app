"use client";

/**
 * Contratos (/contratos, chave contratos) · módulo Contratos, fase 2 — prévia aprovada em 19/11/2026 (versão 10).
 * Back-end: ct_contratos.php. Abas: Contratos (lista + ficha) e Novo contrato. Ambiente de vendas (19/11/2026): Novo contrato
 * manda a venda para as Propostas de Adesão (/propostas-adesao, Administrativo), sem número; o contrato sai lá, com a adesão paga.
 * Até a virada, contratos reais continuam na Unymos: aqui só contratos de teste (número a partir de 900001).
 * Lista: busca, filtros por lista com busca, Colunas (37 campos, salvas por usuário), Exportar (CSV) e ordenação por coluna
 * (OrdenarTabelas, no app-shell).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconFileText } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import { api, BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CAMPO_P, CARTAO, ERRO, Janela, mensagemErro, NOTA, SELO, SUB, useAviso } from "../contas-pagar/components/fin";
import { brl, Combo, isoParaBR, type Linha, SIT_SELO, URL_CT, useBase } from "./components/ct";
import FichaContrato from "./components/FichaContrato";
import Novo from "./components/Novo";

type Aba = "lista" | "novo";
type Coluna = { k: string; nome: string; grupo: string; num?: boolean; v: (l: Linha) => React.ReactNode; csv?: (l: Linha) => string | number | null };

const COLUNAS: Coluna[] = [
    { k: "numero", nome: "Nº", grupo: "Contrato", v: (l) => <b>{l.numero}</b>, csv: (l) => l.numero },
    { k: "situacao", nome: "Situação", grupo: "Contrato", v: (l) => <span className={`${SELO} ${SIT_SELO[l.situacao]}`}>{l.situacao_nome}</span>, csv: (l) => l.situacao_nome },
    { k: "vencidas", nome: "Vencidas", grupo: "Contrato", num: true, v: (l) => l.vencidas ?? "—" },
    { k: "data_contrato", nome: "Data do contrato", grupo: "Contrato", v: (l) => isoParaBR(l.data_contrato) },
    { k: "data_carencia", nome: "Data de carência", grupo: "Contrato", v: (l) => isoParaBR(l.data_carencia) || "—" },
    { k: "aniversario", nome: "Aniversário (fim do ciclo)", grupo: "Contrato", v: (l) => isoParaBR(l.aniversario) || "—" },
    { k: "tempo", nome: "Tempo de contrato", grupo: "Contrato", num: true, v: (l) => (l.tempo_meses === null ? "—" : `${l.tempo_meses} meses`), csv: (l) => l.tempo_meses },
    { k: "origem", nome: "Origem da venda", grupo: "Contrato", v: (l) => l.origem || "—" },
    { k: "titular", nome: "Titular", grupo: "Titular", v: (l) => l.titular },
    { k: "cpf", nome: "CPF (mascarado)", grupo: "Titular", v: (l) => l.cpf || "—" },
    { k: "nascimento", nome: "Nascimento", grupo: "Titular", v: (l) => isoParaBR(l.nascimento) || "—" },
    { k: "idade", nome: "Idade", grupo: "Titular", num: true, v: (l) => l.idade ?? "—" },
    { k: "sexo", nome: "Sexo", grupo: "Titular", v: (l) => (l.sexo === "F" ? "Feminino" : l.sexo === "M" ? "Masculino" : "—") },
    { k: "telefone", nome: "Telefone", grupo: "Titular", v: (l) => l.telefone || "—" },
    { k: "email", nome: "E-mail", grupo: "Titular", v: (l) => l.email || "—" },
    { k: "cidade", nome: "Cidade", grupo: "Endereço", v: (l) => l.cidade || "—" },
    { k: "bairro", nome: "Bairro", grupo: "Endereço", v: (l) => l.bairro || "—" },
    { k: "endereco", nome: "Endereço", grupo: "Endereço", v: (l) => l.endereco || "—" },
    { k: "forma", nome: "Forma de cobrança", grupo: "Cobrança", v: (l) => l.forma_cobranca },
    { k: "dia", nome: "Dia de pagamento", grupo: "Cobrança", num: true, v: (l) => l.dia_pagamento },
    { k: "cobrador", nome: "Cobrador", grupo: "Cobrança", v: (l) => l.cobrador || "—" },
    { k: "mensalidade", nome: "Mensalidade", grupo: "Cobrança", num: true, v: (l) => brl(l.mensalidade), csv: (l) => l.mensalidade },
    { k: "bonificacoes", nome: "Bonificações", grupo: "Cobrança", v: (l) => (l.bon_pendentes ? `${l.bon_pendentes} aguardando` : l.bon_ativas ? `${l.bon_ativas} ativa(s)` : "—") },
    { k: "reajuste", nome: "Mês de reajuste", grupo: "Cobrança", num: true, v: (l) => l.mes_reajuste ?? "—" },
    { k: "ultima_paga", nome: "Última parcela paga", grupo: "Cobrança", v: () => "—" },
    { k: "pagas", nome: "Parcelas pagas", grupo: "Cobrança", num: true, v: () => "—" },
    { k: "plano", nome: "Plano", grupo: "Plano", v: (l) => l.plano },
    { k: "faixa", nome: "Faixa do FLEX", grupo: "Plano", v: (l) => l.faixa_flex || "—" },
    { k: "dependentes", nome: "Dependentes", grupo: "Plano", num: true, v: (l) => l.dependentes },
    { k: "extras", nome: "Extras pagos", grupo: "Plano", num: true, v: (l) => l.extras },
    { k: "pets", nome: "Pets", grupo: "Plano", num: true, v: (l) => l.pets },
    { k: "aditivos", nome: "Aditivos", grupo: "Plano", v: (l) => l.aditivos || "—" },
    { k: "vendedor", nome: "Vendedor", grupo: "Venda e outros", v: (l) => l.vendedor || "—" },
    { k: "indicador", nome: "Indicador", grupo: "Venda e outros", v: (l) => l.indicador || "—" },
    { k: "falecido", nome: "Titular falecido", grupo: "Venda e outros", v: (l) => (l.titular_falecido ? "Sim" : "Não") },
    { k: "os", nome: "Serviços prestados (OS)", grupo: "Venda e outros", v: () => "—" },
    { k: "cancelamento", nome: "Data e motivo do cancelamento", grupo: "Venda e outros", v: (l) => l.cancelamento || "—" },
];
const PADRAO = ["numero", "titular", "plano", "situacao", "vencidas", "mensalidade", "cidade"];
const GRUPOS = Array.from(new Set(COLUNAS.map((c) => c.grupo)));

export default function Page() {
    const { base, erro, recarregar } = useBase();
    const { avisar, aviso } = useAviso();
    const [aba, setAba] = useState<Aba>("lista");
    const [aberto, setAberto] = useState<number | null>(null);
    const [linhas, setLinhas] = useState<Linha[] | null>(null);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [erroLista, setErroLista] = useState("");
    const [q, setQ] = useState("");
    const [fSit, setFSit] = useState<string | null>(null);
    const [fPlano, setFPlano] = useState<string | number | null>(null);
    const [fBon, setFBon] = useState<string | null>(null);
    const [fCidade, setFCidade] = useState<number | null>(null);
    const [cols, setCols] = useState<string[]>(PADRAO);
    const [verCols, setVerCols] = useState(false);
    const [verBairros, setVerBairros] = useState(false);

    useEffect(() => {
        const salvas = base?.colunas?.lista;
        if (salvas && salvas.length) setCols(salvas.filter((k) => COLUNAS.some((c) => c.k === k)));
    }, [base]);

    const vez = useRef(0);
    const carregar = useCallback(
        async (pag = 1) => {
            const minha = ++vez.current;
            const p = new URLSearchParams();
            if (q.trim()) p.set("q", q.trim());
            if (fSit) p.set("situacao", fSit);
            if (fPlano !== null) p.set("plano_id", String(fPlano));
            if (fBon) p.set("bonificacao", fBon);
            if (fCidade) p.set("cidade_id", String(fCidade));
            p.set("pagina", String(pag));
            try {
                const j = await api(URL_CT, "lista", undefined, "&" + p.toString());
                if (minha !== vez.current) return;
                setLinhas((l) => (pag > 1 && l ? [...l, ...j.dados.linhas] : j.dados.linhas));
                setTotal(j.dados.total);
                setPagina(pag);
                setErroLista("");
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível carregar a lista.");
                if (m && minha === vez.current) setErroLista(m);
            }
        },
        [q, fSit, fPlano, fBon, fCidade],
    );
    useEffect(() => {
        const t = setTimeout(() => void carregar(1), q ? 300 : 0);
        return () => clearTimeout(t);
    }, [carregar, q]);

    const visiveis = COLUNAS.filter((c) => cols.includes(c.k)).sort((a, b) => cols.indexOf(a.k) - cols.indexOf(b.k));

    const salvarCols = async (novas: string[]) => {
        setCols(novas);
        try {
            await api(URL_CT, "colunas", { tela: "lista", colunas: novas });
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar as colunas.");
            if (m) avisar(m);
        }
    };

    const exportar = () => {
        if (!linhas?.length) return avisar("Nada para exportar.");
        const esc = (v: unknown) => {
            const s = v === null || v === undefined ? "" : String(v);
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const txt = (c: Coluna, l: Linha) => {
            if (c.csv) return c.csv(l);
            const v = c.v(l);
            return typeof v === "string" || typeof v === "number" ? v : "";
        };
        const csv = [visiveis.map((c) => esc(c.nome)).join(";"), ...linhas.map((l) => visiveis.map((c) => esc(txt(c, l))).join(";"))].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        a.download = `contratos-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    const opPlanos = useMemo(
        () => (base ? [{ v: "antigos" as string | number, t: "Planos antigos", s: "fora de venda" }, ...base.planos.map((p) => ({ v: p.id as string | number, t: p.nome, s: p.situacao === "fora_venda" ? "antigo" : undefined }))] : []),
        [base],
    );

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconFileText} titulo="Contratos" />
                {erro ? <div className={ERRO}>{erro}</div> : null}
                <div className="rounded-xl bg-[#FCF3CC] px-4 py-2.5 text-[14px] font-bold text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                    Até a virada, os contratos reais continuam na Unymos. Aqui ficam só contratos de teste (números a partir de 900001).
                </div>
                <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-[#E3E8F0] dark:border-white/[0.12]">
                    {(
                        [
                            ["lista", "Contratos"],
                            ["novo", "Novo contrato"],
                        ] as [Aba, string][]
                    ).map(([k, n]) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={aba === k}
                            onClick={() => {
                                setAba(k);
                                if (k === "lista") setAberto(null);
                            }}
                            className={`min-h-11 px-3.5 text-[15px] font-extrabold ${aba === k ? "shadow-[inset_0_-3px_0_#F2CB3F]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}
                        >
                            {n}
                        </button>
                    ))}
                    {base?.pode.bairros && base.bairros_pedidos ? (
                        <button type="button" className={`${BTN_PEQ} ml-auto`} onClick={() => setVerBairros(true)}>
                            {base.bairros_pedidos} bairro(s) para conferir
                        </button>
                    ) : null}
                </div>

                {!base ? (
                    erro ? null : <div className={`${CARTAO} p-6 text-[#5B6478]`}>Carregando…</div>
                ) : aba === "novo" ? (
                    <Novo
                        base={base}
                        recarregarBase={recarregar}
                        avisar={avisar}
                        onCriado={() => {
                            // a venda foi para as Propostas de Adesão (Administrativo): o contrato sai lá, com a adesão paga
                            setAba("lista");
                        }}
                    />
                ) : aberto ? (
                    <FichaContrato id={aberto} base={base} recarregarBase={recarregar} avisar={avisar} onVoltar={() => setAberto(null)} onMudou={() => void carregar(1)} />
                ) : (
                    <div className={`${CARTAO} flex min-w-0 flex-col`}>
                        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))_auto]">
                            <input className={CAMPO_P} placeholder="Nome, nº do contrato, CPF ou telefone" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
                            <Combo classe={CAMPO_P} rotulo="Situação" vazio="Todas as situações" opcoes={Object.entries(base.listas.situacoes).map(([v, t]) => ({ v, t }))} valor={fSit} onChange={setFSit} />
                            <Combo classe={CAMPO_P} rotulo="Plano" vazio="Todos os planos" opcoes={opPlanos} valor={fPlano} onChange={setFPlano} />
                            <Combo
                                classe={CAMPO_P}
                                rotulo="Bonificação"
                                vazio="Bonificações: todas"
                                opcoes={[
                                    { v: "pendente", t: "Aguardando a Gestão" },
                                    { v: "ativa", t: "Com bonificação ativa" },
                                ]}
                                valor={fBon}
                                onChange={setFBon}
                            />
                            <Combo classe={CAMPO_P} rotulo="Cidade" vazio="Todas as cidades" opcoes={base.cidades.map((c) => ({ v: c.id, t: `${c.nome} – ${c.uf}` }))} valor={fCidade} onChange={setFCidade} />
                            <div className="flex gap-2">
                                <button type="button" className={BTN_PEQ} onClick={() => setVerCols(true)}>
                                    Colunas
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={exportar}>
                                    Exportar
                                </button>
                            </div>
                        </div>
                        {erroLista ? <div className={`${ERRO} mx-3 mb-3`}>{erroLista}</div> : null}
                        <div className="overflow-x-auto px-1 pb-1">
                            <table className="w-full min-w-[720px] text-[14.5px]">
                                <thead>
                                    <tr>
                                        {visiveis.map((c) => (
                                            <th key={c.k} className={`whitespace-nowrap border-b border-[#E3E8F0] px-3 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF] ${c.num ? "text-right" : "text-left"}`}>
                                                {c.nome}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {linhas === null ? (
                                        <tr>
                                            <td colSpan={visiveis.length} className="px-3 py-6 text-center text-[#5B6478]">
                                                Carregando…
                                            </td>
                                        </tr>
                                    ) : !linhas.length ? (
                                        <tr>
                                            <td colSpan={visiveis.length} className="px-3 py-6 text-center text-[#5B6478]">
                                                Nenhum contrato encontrado. Os contratos de teste aparecem aqui quando a proposta gera o contrato (Propostas de Adesão).
                                            </td>
                                        </tr>
                                    ) : (
                                        linhas.map((l) => (
                                            <tr
                                                key={l.id}
                                                tabIndex={0}
                                                onClick={() => setAberto(l.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") setAberto(l.id);
                                                }}
                                                className="cursor-pointer border-b border-[#EEF2F7] hover:bg-[#F6F8FB] focus-visible:bg-[#E9EFF6] dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                                            >
                                                {visiveis.map((c) => (
                                                    <td key={c.k} className={`px-3 py-2.5 ${c.num ? "text-right" : ""}`}>
                                                        {c.v(l)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                            <span className={SUB}>
                                {linhas ? `${linhas.length} de ${total} contrato(s)` : ""} · clique no nome da coluna para ordenar
                            </span>
                            {linhas && linhas.length < total ? (
                                <button type="button" className={BTN_PEQ} onClick={() => void carregar(pagina + 1)}>
                                    Carregar mais
                                </button>
                            ) : null}
                            <button type="button" className={`${BTN_PEQ_PRI} ml-auto`} onClick={() => setAba("novo")}>
                                + Novo contrato
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {verCols ? (
                <Janela
                    titulo="Colunas da lista"
                    sub="Marque o que quer ver. Fica salvo para você."
                    largura="max-w-3xl"
                    onFechar={() => setVerCols(false)}
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={() => void salvarCols(PADRAO)}>
                                Voltar ao padrão
                            </button>
                            <button type="button" className={BTN_PRI} onClick={() => setVerCols(false)}>
                                Pronto
                            </button>
                        </>
                    }
                >
                    {GRUPOS.map((g) => (
                        <div key={g}>
                            <h3 className="mb-1 mt-1 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{g}</h3>
                            <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
                                {COLUNAS.filter((c) => c.grupo === g).map((c) => (
                                    <label key={c.k} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14.5px]">
                                        <input
                                            type="checkbox"
                                            className="size-5 accent-[#313C55]"
                                            checked={cols.includes(c.k)}
                                            onChange={(e) => void salvarCols(e.target.checked ? [...cols, c.k] : cols.filter((x) => x !== c.k))}
                                        />
                                        {c.nome}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className={NOTA}>Vencidas, cobrador, última parcela, parcelas pagas e serviços prestados passam a ser preenchidos com o financeiro do contrato (fase 3) e a ligação com o atendimento.</div>
                </Janela>
            ) : null}

            {verBairros && base ? <JanelaBairros base={base} avisar={avisar} onFechar={() => setVerBairros(false)} onMudou={recarregar} /> : null}
            {aviso}
        </div>
    );
}

function JanelaBairros({ base, avisar, onFechar, onMudou }: { base: { bairros: { id: number; cidade_id: number; nome: string; pedido: boolean }[]; cidades: { id: number; nome: string; uf: string }[] }; avisar: (m: string) => void; onFechar: () => void; onMudou: () => Promise<unknown> }) {
    const pedidos = base.bairros.filter((b) => b.pedido);
    const decidir = async (id: number, decisao: "ativo" | "inativo") => {
        try {
            const j = await api(URL_CT, "bairro_decidir", { id, decisao });
            avisar(j.msg);
            await onMudou();
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar.");
            if (m) avisar(m);
        }
    };
    return (
        <Janela titulo="Bairros para conferir" sub="Pedidos feitos no cadastro. Aprove para entrar na lista; recuse se já existe com outro nome." onFechar={onFechar}>
            {pedidos.length ? (
                pedidos.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
                        <div className="min-w-0 flex-1">
                            <b>{b.nome}</b>
                            <div className={SUB}>{base.cidades.find((c) => c.id === b.cidade_id)?.nome}</div>
                        </div>
                        <button type="button" className={BTN_PEQ_PRI} onClick={() => void decidir(b.id, "ativo")}>
                            Aprovar
                        </button>
                        <button type="button" className={BTN_PEQ} onClick={() => void decidir(b.id, "inativo")}>
                            Recusar
                        </button>
                    </div>
                ))
            ) : (
                <p className={SUB}>Nenhum bairro aguardando.</p>
            )}
        </Janela>
    );
}
