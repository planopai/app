"use client";

/**
 * Ficha do contrato — Contratos fase 2, prévia aprovada em 19/11/2026.
 * Abas: Contrato · Beneficiários · Aditivos e vendas (com Bonificações) · Financeiro (fase 3) · Transporte · Histórico.
 */
import React, { useCallback, useEffect, useState } from "react";
import { IconChevronLeft } from "@tabler/icons-react";
import { api, BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CAMPO, CARTAO, diaMais, hojeISO, Janela, mensagemErro, NOTA, ROTULO, SELO, SUB } from "../../contas-pagar/components/fin";
import { type Base, type Beneficiario, type Bonificacao, brl, CampoData, Combo, dataValidar, type Ficha, isoParaBR, mesBRCurto, PORTES, SIT_SELO, TIPO_VENDA_REG, URL_CT, useGravar } from "./ct";
import { benefParaEnvio, benefVazio, JanelaBenef } from "./Benef";
import { CamposTitular, type TitularForm, titularDeDados, titularParaEnvio, titularProblemas, titularVazio } from "./Titular";
import { AvisoObitos } from "./Obitos";

type Sub = "contrato" | "benef" | "vendas" | "fin" | "transp" | "hist";
const SUBS: [Sub, string][] = [
    ["contrato", "Contrato"],
    ["benef", "Beneficiários"],
    ["vendas", "Aditivos e vendas"],
    ["fin", "Financeiro"],
    ["transp", "Transporte"],
    ["hist", "Histórico"],
];
const S_BON: Record<Bonificacao["situacao"], [string, string]> = {
    pendente: ["Aguardando a Gestão", "bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]"],
    aprovada: ["Aprovada", "bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"],
    recusada: ["Recusada", "bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]"],
    encerrada: ["Encerrada", "bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]"],
};
const TH = "px-2 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
const TD = "px-2 py-2.5 align-top";
const TR = "border-t border-[#E3E8F0] dark:border-white/[0.08]";

type Modal =
    | { k: "ativar" }
    | { k: "titular" }
    | { k: "transferir" }
    | { k: "incluir"; pet: boolean }
    | { k: "sair"; b: Beneficiario; motivo: "excluido" | "falecido" }
    | { k: "aditivo" }
    | { k: "encerrar"; venda_id: number; nome: string }
    | { k: "trocar" }
    | { k: "bonificar" }
    | { k: "cancelar" }
    | null;

export default function FichaContrato({ id, base, recarregarBase, avisar, onVoltar, onMudou }: { id: number; base: Base; recarregarBase: () => Promise<unknown>; avisar: (m: string) => void; onVoltar: () => void; onMudou: () => void }) {
    const [f, setF] = useState<Ficha | null>(null);
    const [erro, setErro] = useState("");
    const [sub, setSub] = useState<Sub>("contrato");
    const [modal, setModal] = useState<Modal>(null);
    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_CT, "ficha", undefined, `&id=${id}`);
            setF(j.dados);
            setErro("");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível abrir o contrato.");
            if (m) setErro(m);
        }
    }, [id]);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    const depois = useCallback(async () => {
        await carregar();
        onMudou();
    }, [carregar, onMudou]);
    const gravar = useGravar(avisar, depois);
    const fechar = () => setModal(null);
    const acao = async (a: string, corpo: Record<string, unknown>) => {
        const r = await gravar(a, corpo);
        if (r) fechar();
        return r;
    };

    if (erro) return <div className="rounded-xl bg-[#FDECEA] px-4 py-3 font-bold text-[#B42318]">{erro}</div>;
    if (!f) return <div className={`${CARTAO} p-6 text-[#5B6478]`}>Carregando o contrato…</div>;
    const c = f.contrato;
    const aberto = c.situacao !== "cancelado";
    const plano = base.planos.find((p) => p.id === c.plano_id);
    const ativos = f.beneficiarios.filter((b) => b.situacao === "ativo");
    // Titular falecido sem novo titular (23/11/2026): prazo do sucessor (7.1); o contrato não encerra sozinho
    const prazoSucessor = c.titular_falecido && c.titular_falecido_em ? diaMais(c.titular_falecido_em, 30) : null;
    const temTitularAtivo = ativos.some((b) => b.tipo === "titular");

    const campos: [string, React.ReactNode][] = [
        ["Titular", `${c.titular} · CPF ${c.cpf || "—"}`],
        ["Plano", c.plano + (c.faixa_flex ? ` · faixa ${c.faixa_flex}` : "")],
        ["Data do contrato", isoParaBR(c.data_contrato)],
        ["Adesão paga em", c.data_ativacao ? isoParaBR(c.data_ativacao) : "Ainda não (pré-cadastro)"],
        ["Carência conta de", c.data_ativacao ? `Pagamento da adesão (${isoParaBR(c.data_ativacao)}) · natural até ${isoParaBR(c.data_carencia)}` : "Pagamento da adesão"],
        ["Ciclo atual", c.aniversario ? `12 parcelas até ${isoParaBR(c.aniversario)}` : "Começa com a 1ª mensalidade"],
        ["1ª mensalidade", isoParaBR(c.primeira_mensalidade)],
        ["Mensalidade", `${brl(c.mensalidade)} (plano ${brl(c.valor_plano)}${c.mensalidade !== c.valor_plano ? " + extras e aditivos" : ""})`],
        ["Adesão", brl(c.valor_adesao)],
        ["Forma de cobrança", `${c.forma_cobranca} · dia ${c.dia_pagamento}`],
        ["Telefones", [c.telefone, c.telefone2].filter(Boolean).join(" · ") || "—"],
        ["E-mail", c.email || "—"],
        ["Endereço", [c.endereco, c.bairro, c.cidade].filter(Boolean).join(" · ") || "—"],
        ["Vendedor", c.vendedor || "—"],
        ["Origem da venda", c.origem || "—"],
        ["Tipo de venda", c.tipo_venda === "nova" ? "Nova" : c.tipo_venda === "reativacao" ? "Reativação" : "Transferência"],
        ["Indicado por", c.indicador || "—"],
        ["Responsável pelo pagamento", c.responsavel || "O próprio titular"],
    ];

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_PEQ} onClick={onVoltar}>
                    <IconChevronLeft size={16} /> Contratos
                </button>
                <h2 className="text-[20px] font-extrabold">Contrato {c.numero}</h2>
                <span className={`${SELO} ${SIT_SELO[c.situacao]}`}>{c.situacao_nome}</span>
                {c.bon_pendentes ? <span className={`${SELO} ${S_BON.pendente[1]}`}>Bonificação aguardando a Gestão</span> : null}
            </div>
            {aberto ? <AvisoObitos obitos={f.obitos || []} hoje={base.hoje} gravar={gravar} /> : null}
            {aberto && c.titular_falecido ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#FCF3CC] px-4 py-3 text-[14px] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                    <span className="min-w-0 flex-1">
                        <b>Titular falecido{c.titular_falecido_em ? ` em ${isoParaBR(c.titular_falecido_em)}` : ""}.</b>{" "}
                        {prazoSucessor && prazoSucessor >= base.hoje
                            ? `Prazo do sucessor para aceitar o contrato: até ${isoParaBR(prazoSucessor)} (cláusula 7.1).`
                            : `Prazo do sucessor venceu${prazoSucessor ? ` em ${isoParaBR(prazoSucessor)}` : ""}. O contrato continua enquanto houver pagamento: tente de novo a mudança de titular.`}
                    </span>
                    <button type="button" className={BTN_PEQ_PRI} onClick={() => setModal({ k: "transferir" })}>
                        Transferir titularidade
                    </button>
                </div>
            ) : null}
            <div className={`${CARTAO} flex flex-col gap-4 p-4 sm:p-5`}>
                <div role="tablist" className="flex flex-wrap gap-2">
                    {SUBS.map(([k, n]) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={sub === k}
                            onClick={() => setSub(k)}
                            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[14px] font-extrabold ${sub === k ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]"}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>

                {sub === "contrato" ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {campos.map(([l, v]) => (
                                <div key={l}>
                                    <span className={ROTULO}>{l}</span>
                                    <div className="min-h-11 rounded-xl bg-[#F1F4F8] px-3 py-2.5 text-[15px] font-bold break-words dark:bg-[#1C2334]">{v}</div>
                                </div>
                            ))}
                        </div>
                        {c.cancelamento ? <div className={NOTA}>Cancelado: {c.cancelamento}</div> : null}
                        {aberto ? (
                            <div className="flex flex-wrap gap-2">
                                {c.situacao === "pre" ? (
                                    <button type="button" className={BTN_PEQ_PRI} onClick={() => setModal({ k: "ativar" })}>
                                        Registrar pagamento da adesão
                                    </button>
                                ) : null}
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "titular" })}>
                                    Alterar dados do titular
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "transferir" })}>
                                    Transferir titularidade
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "trocar" })}>
                                    Trocar de plano
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "cancelar" })}>
                                    Cancelar contrato
                                </button>
                            </div>
                        ) : null}
                        {c.situacao === "pre" ? (
                            <div className={NOTA}>
                                <span>Pré-cadastro: vira Ativo quando a adesão é paga. Até a fase 3 (financeiro do contrato), o pagamento é registrado aqui à mão; depois, a baixa da adesão ativa sozinha.</span>
                            </div>
                        ) : null}
                    </>
                ) : null}

                {sub === "benef" ? (
                    <>
                        {c.faixa_flex ? (
                            <div className="rounded-xl bg-[#E9EFF6] px-3.5 py-2.5 text-[14px] dark:bg-[#3D6A99]/25">
                                <b>Faixa do FLEX:</b> {c.faixa_flex}
                                {c.flex_idade !== null ? ` (pessoa mais velha com ${c.flex_idade} anos na venda)` : ""} · {brl(c.valor_plano)}/mês. Inclusão de alguém mais velho muda na próxima parcela; saída da pessoa mais velha, só no ciclo seguinte.
                            </div>
                        ) : null}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[820px] text-[14.5px]">
                                <thead>
                                    <tr>
                                        <th className={TH}>Nome</th>
                                        <th className={TH}>Tipo</th>
                                        <th className={TH}>Parentesco</th>
                                        <th className={TH}>Nascimento</th>
                                        <th className={`${TH} text-right`}>Idade</th>
                                        <th className={`${TH} text-right`}>Valor</th>
                                        <th className={TH}>Carência</th>
                                        <th className={TH}>Situação</th>
                                        <th className={TH} aria-label="Ações" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {f.beneficiarios.map((b) => (
                                        <tr key={b.id} className={`${TR} ${b.situacao !== "ativo" ? "opacity-60" : ""}`}>
                                            <td className={TD}>
                                                <b>{b.nome}</b>
                                                {b.sucessor ? <span className={`${SELO} ml-1.5 ${S_BON.aprovada[1]}`}>Sucessor</span> : null}
                                                {c.flex_beneficiario_id === b.id ? <span className={`${SELO} ml-1.5 bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]`}>Define a faixa</span> : null}
                                            </td>
                                            <td className={TD}>{b.tipo === "titular" ? (b.situacao !== "ativo" && temTitularAtivo ? "Ex-titular" : "Titular") : b.tipo === "pet" ? `Pet (${b.pet_especie}, ${PORTES[b.pet_porte || ""] || ""})` : b.pago ? "Extra pago" : "Dependente"}</td>
                                            <td className={TD}>{b.parentesco || "—"}</td>
                                            <td className={TD}>{isoParaBR(b.nascimento) || "—"}</td>
                                            <td className={`${TD} text-right`}>{b.idade ?? "—"}</td>
                                            <td className={`${TD} text-right`}>{b.valor_mensal ? brl(b.valor_mensal) : "—"}</td>
                                            <td className={TD}>{b.carencia_ate ? (b.carencia_ate <= base.hoje ? "Cumprida" : `Até ${isoParaBR(b.carencia_ate)}`) : "Conta da adesão"}</td>
                                            <td className={TD}>
                                                {b.situacao === "ativo" ? "Ativo" : b.situacao === "falecido" ? `Falecido em ${isoParaBR(b.falecido_em)}` : `Excluído em ${isoParaBR(b.excluido_em)}`}
                                                {b.atendimento_id ? (
                                                    <a className="block text-[12.5px] font-bold underline" href={`/acompanhamento?editar=${b.atendimento_id}`} target="_blank" rel="noreferrer">
                                                        Atendimento nº {b.atendimento_id}
                                                    </a>
                                                ) : null}
                                            </td>
                                            <td className={`${TD} whitespace-nowrap`}>
                                                {aberto && b.situacao === "ativo" ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {b.tipo !== "titular" && b.tipo !== "pet" && !b.sucessor ? (
                                                            <button type="button" className={BTN_PEQ} onClick={() => void gravar("sucessor", { beneficiario_id: b.id })}>
                                                                Tornar sucessor
                                                            </button>
                                                        ) : null}
                                                        {b.tipo !== "titular" ? (
                                                            <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "sair", b, motivo: "excluido" })}>
                                                                Excluir
                                                            </button>
                                                        ) : null}
                                                        {b.tipo !== "pet" ? (
                                                            <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "sair", b, motivo: "falecido" })}>
                                                                Registrar falecimento
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {aberto ? (
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={BTN_PEQ_PRI} disabled={plano?.situacao !== "vende"} onClick={() => setModal({ k: "incluir", pet: false })}>
                                    + Incluir beneficiário
                                </button>
                                {plano?.beneficiarios?.pet ? (
                                    <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "incluir", pet: true })}>
                                        + Incluir pet
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                        <div className={NOTA}>
                            <span>
                                <b>Falecimento com atendimento do PAI:</b> quando a OS do atendimento é montada com o número deste contrato, aparece em &quot;Falecimentos a confirmar&quot; (acima), com a sugestão pelo nome e nascimento. Ao confirmar, a pessoa sai do contrato com a data e o número do atendimento. &quot;Registrar falecimento&quot; fica para os casos sem atendimento do PAI.
                            </span>
                        </div>
                        <div className={NOTA}>
                            <span>A inclusão confere a regra de Beneficiários do plano (quantidade, pet, nascimento). Plano fora de venda não aceita inclusão. Cada inclusão ganha carência própria e fica no histórico. O sucessor precisa ser maior de idade.</span>
                        </div>
                    </>
                ) : null}

                {sub === "vendas" ? (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-[14.5px]">
                                <thead>
                                    <tr>
                                        <th className={TH}>Data</th>
                                        <th className={TH}>Tipo</th>
                                        <th className={TH}>O quê</th>
                                        <th className={`${TH} text-right`}>Adesão</th>
                                        <th className={`${TH} text-right`}>Mensal</th>
                                        <th className={TH}>Vendedor</th>
                                        <th className={TH}>Situação</th>
                                        <th className={TH} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {f.vendas.map((v) => (
                                        <tr key={v.id} className={TR}>
                                            <td className={TD}>{isoParaBR(v.data)}</td>
                                            <td className={TD}>{TIPO_VENDA_REG[v.tipo]}</td>
                                            <td className={TD}>{v.tipo === "aditivo" ? v.aditivo : v.tipo === "troca_plano" ? `${v.plano_anterior} → ${v.plano}` : v.tipo === "inclusao" ? v.beneficiario : v.plano}</td>
                                            <td className={`${TD} text-right`}>{v.valor_adesao ? brl(v.valor_adesao) : "—"}</td>
                                            <td className={`${TD} text-right`}>{v.valor_mensal ? brl(v.valor_mensal) : "—"}</td>
                                            <td className={TD}>{v.vendedor || "—"}</td>
                                            <td className={TD}>
                                                <span className={`${SELO} ${v.situacao === "ativa" ? S_BON.aprovada[1] : S_BON.encerrada[1]}`}>{v.situacao === "ativa" ? "Ativa" : `Encerrada ${isoParaBR(v.encerrada_em)}`}</span>
                                            </td>
                                            <td className={TD}>
                                                {aberto && v.tipo === "aditivo" && v.situacao === "ativa" ? (
                                                    <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "encerrar", venda_id: v.id, nome: v.aditivo || "" })}>
                                                        Encerrar
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {aberto && plano?.aditivos.some((a) => a.nome !== "Sucessor do contrato" || plano.situacao === "fora_venda") ? (
                            <div>
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "aditivo" })}>
                                    + Incluir aditivo
                                </button>
                            </div>
                        ) : null}
                        <h3 className="mt-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">Bonificações</h3>
                        {f.bonificacoes.length ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-[14.5px]">
                                    <thead>
                                        <tr>
                                            <th className={TH}>O quê</th>
                                            <th className={TH}>Quanto</th>
                                            <th className={TH}>Prazo</th>
                                            <th className={TH}>Motivo</th>
                                            <th className={TH}>Situação</th>
                                            <th className={TH} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {f.bonificacoes.map((b) => (
                                            <tr key={b.id} className={TR}>
                                                <td className={TD}>{b.alvo === "mensalidade" ? "Mensalidade" : b.alvo === "aditivo" ? `Aditivo ${b.aditivo}` : `Beneficiário ${b.beneficiario}`}</td>
                                                <td className={TD}>{b.modo === "total" ? "100%" : b.modo === "percentual" ? `${b.valor.toLocaleString("pt-BR")}%` : brl(b.valor)}</td>
                                                <td className={TD}>{mesBRCurto(b.desde)} {b.ate ? `a ${mesBRCurto(b.ate)}` : "· sem prazo"}</td>
                                                <td className={TD}>
                                                    {b.motivo}
                                                    <div className={SUB}>
                                                        pedido por {b.pedido_por || "—"}
                                                        {b.decidido_por ? ` · ${b.situacao} por ${b.decidido_por}` : ""}
                                                        {b.decisao_obs ? ` · ${b.decisao_obs}` : ""}
                                                    </div>
                                                </td>
                                                <td className={TD}>
                                                    <span className={`${SELO} ${S_BON[b.situacao][1]}`}>{S_BON[b.situacao][0]}</span>
                                                </td>
                                                <td className={`${TD} whitespace-nowrap`}>
                                                    {base.pode.gestao && b.situacao === "pendente" ? (
                                                        <div className="flex gap-1.5">
                                                            <button type="button" className={BTN_PEQ_PRI} onClick={() => void gravar("bonificacao_decidir", { id: b.id, decisao: "aprovada" })}>
                                                                Aprovar
                                                            </button>
                                                            <button type="button" className={BTN_PEQ} onClick={() => void gravar("bonificacao_decidir", { id: b.id, decisao: "recusada" })}>
                                                                Recusar
                                                            </button>
                                                        </div>
                                                    ) : base.pode.gestao && b.situacao === "aprovada" ? (
                                                        <button type="button" className={BTN_PEQ} onClick={() => void gravar("bonificacao_decidir", { id: b.id, decisao: "encerrada" })}>
                                                            Encerrar
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className={SUB}>Nenhuma bonificação neste contrato.</p>
                        )}
                        {aberto ? (
                            <div>
                                <button type="button" className={BTN_PEQ} onClick={() => setModal({ k: "bonificar" })}>
                                    + Bonificar
                                </button>
                            </div>
                        ) : null}
                        <div className={NOTA}>
                            <span>Bonificação: mensalidade, aditivo ou beneficiário pago; 100%, % ou R$; por um período ou sem prazo. Todo pedido vai para a <b>aprovação da Gestão</b> e só vale depois de aprovado. O desconto entra nas parcelas na fase 3.</span>
                        </div>
                    </>
                ) : null}

                {sub === "fin" ? (
                    <div className={NOTA}>
                        <span>O financeiro do contrato (parcelas, carnê, Pix e BolePix do Sicredi, pagamento parcial, baixa e situação automática pela regra do termo) chega na fase 3. Até a virada, as mensalidades reais continuam na Unymos.</span>
                    </div>
                ) : null}
                {sub === "transp" ? (
                    <div className={NOTA}>
                        <span>Os usos do transporte de ambulância (associado pelo plano) vão aparecer aqui quando a tela de Transporte for feita, depois dos contratos.</span>
                    </div>
                ) : null}
                {sub === "hist" ? (
                    f.historico.length ? (
                        <ul className="flex flex-col gap-2">
                            {f.historico.map((h, i) => (
                                <li key={i} className="rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-[14.5px] dark:bg-[#1C2334]">
                                    <div className={SUB}>
                                        {new Date(h.criado_em.replace(" ", "T")).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {h.usuario || "sistema"}
                                    </div>
                                    {h.descricao}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={SUB}>Sem histórico.</p>
                    )
                ) : null}
            </div>

            {modal?.k === "ativar" ? <JanelaAtivar base={base} onFechar={fechar} onSalvar={(data) => acao("ativar", { id: c.id, data })} /> : null}
            {modal?.k === "transferir" ? (
                <JanelaTransferir f={f} base={base} antigo={plano?.situacao === "fora_venda"} recarregarBase={recarregarBase} avisar={avisar} onFechar={fechar} onSalvar={(corpo) => acao("transferir", { contrato_id: c.id, ...corpo })} />
            ) : null}
            {modal?.k === "titular" ? <JanelaTitular f={f} base={base} recarregarBase={recarregarBase} avisar={avisar} onFechar={fechar} onSalvar={(t) => acao("titular", { id: c.id, ...titularParaEnvio(t, base.hoje) })} /> : null}
            {modal?.k === "incluir" ? (
                <JanelaBenef
                    titulo={modal.pet ? "Incluir pet" : "Incluir beneficiário"}
                    inicial={benefVazio(modal.pet)}
                    base={base}
                    temExtra={!!plano?.itens.some((i) => i.tipo === "extra")}
                    nascimentoObrig={!!plano?.beneficiarios?.nascimento_obrigatorio}
                    onFechar={fechar}
                    onSalvar={(b) => void acao("beneficiario", { contrato_id: c.id, ...benefParaEnvio(b, base.hoje) })}
                />
            ) : null}
            {modal?.k === "sair" ? <JanelaSair b={modal.b} motivo={modal.motivo} base={base} onFechar={fechar} onSalvar={(data) => acao("beneficiario_sair", { id: modal.b.id, motivo: modal.motivo, data })} /> : null}
            {modal?.k === "aditivo" && plano ? (
                <JanelaEscolha
                    titulo="Incluir aditivo"
                    rotulo="Aditivo"
                    opcoes={plano.aditivos
                        .filter((a) => (plano.situacao === "fora_venda" || a.nome !== "Sucessor do contrato") && !f.vendas.some((v) => v.aditivo_id === a.id && v.situacao === "ativa"))
                        .map((a) => ({ v: a.id, t: a.nome, s: a.condicao || undefined }))}
                    nota="O valor vem da regra do aditivo (Tanatopraxia +20% da mensalidade; Translado Nacional R$ 30; Telemedicina por dependente). Carência própria a partir do pagamento."
                    onFechar={fechar}
                    onSalvar={(v) => acao("aditivo", { contrato_id: c.id, aditivo_id: v })}
                />
            ) : null}
            {modal?.k === "encerrar" ? <JanelaAtivar base={base} titulo={`Encerrar aditivo ${modal.nome}`} rotulo="Encerrar em" botao="Encerrar" onFechar={fechar} onSalvar={(data) => acao("aditivo_encerrar", { venda_id: modal.venda_id, data })} /> : null}
            {modal?.k === "trocar" ? (
                <JanelaEscolha
                    titulo="Trocar de plano"
                    rotulo="Plano novo"
                    opcoes={base.planos.filter((p) => p.situacao === "vende" && p.pronto && p.id !== c.plano_id).map((p) => ({ v: p.id, t: p.nome }))}
                    nota="Upgrade: cumpre carência só do que o plano novo tem a mais (ex.: LIGHT → MAX cumpre carência do km ilimitado); telemedicina não tem carência. Aditivos que o plano novo não oferece são encerrados. A mensalidade passa a ser a da tabela vigente."
                    onFechar={fechar}
                    onSalvar={(v) => acao("trocar_plano", { contrato_id: c.id, plano_id: v })}
                />
            ) : null}
            {modal?.k === "bonificar" ? <JanelaBonificar f={f} ativos={ativos} onFechar={fechar} onSalvar={(corpo) => acao("bonificacao", { contrato_id: c.id, ...corpo })} /> : null}
            {modal?.k === "cancelar" ? <JanelaCancelar base={base} onFechar={fechar} onSalvar={(corpo) => acao("cancelar", { id: c.id, ...corpo })} /> : null}
        </div>
    );
}

/* ============================== janelas ============================== */

function Rodape({ onFechar, ok, salvando, botao, onOk }: { onFechar: () => void; ok: boolean; salvando: boolean; botao: string; onOk: () => void }) {
    return (
        <>
            <button type="button" className={BTN_SEC} onClick={onFechar}>
                Voltar
            </button>
            <button type="button" className={BTN_PRI} disabled={!ok || salvando} onClick={onOk}>
                {salvando ? "Salvando…" : botao}
            </button>
        </>
    );
}

function useSalvando(onSalvar: (...a: any[]) => Promise<unknown>) {
    const [s, setS] = useState(false);
    return [
        s,
        async (...a: any[]) => {
            setS(true);
            try {
                await onSalvar(...a);
            } finally {
                setS(false);
            }
        },
    ] as const;
}

function JanelaAtivar({ base, onFechar, onSalvar, titulo = "Pagamento da adesão", rotulo = "Data do pagamento", botao = "Ativar contrato" }: { base: Base; onFechar: () => void; onSalvar: (data: string) => Promise<unknown>; titulo?: string; rotulo?: string; botao?: string }) {
    const [data, setData] = useState(hojeISO().split("-").reverse().join("/"));
    const iso = dataValidar(data, base.hoje, false)[0];
    const [salvando, salvar] = useSalvando(onSalvar);
    return (
        <Janela titulo={titulo} onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={!!iso} salvando={salvando} botao={botao} onOk={() => void salvar(iso)} />}>
            <CampoData valor={data} onChange={setData} hoje={base.hoje} rotulo={rotulo} rotuloCls={ROTULO} nascimento={false} />
            {botao === "Ativar contrato" ? <div className={NOTA}>O contrato vira Ativo e a carência de todos os beneficiários conta desta data. Na fase 3 isso acontece sozinho com a baixa da adesão.</div> : null}
        </Janela>
    );
}

function JanelaTitular({ f, base, recarregarBase, avisar, onFechar, onSalvar }: { f: Ficha; base: Base; recarregarBase: () => Promise<unknown>; avisar: (m: string) => void; onFechar: () => void; onSalvar: (t: TitularForm) => Promise<unknown> }) {
    const d = f.contrato.titular_dados;
    const [t, setT] = useState<TitularForm>({ ...titularVazio(), ...titularDeDados({ ...d, cpf: d.cpf }) });
    const [salvando, salvar] = useSalvando(onSalvar);
    const prob = titularProblemas(t, base.hoje);
    return (
        <Janela titulo="Dados do titular" largura="max-w-4xl" onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={!prob.length} salvando={salvando} botao="Salvar" onOk={() => void salvar(t)} />}>
            <CamposTitular t={t} set={(p) => setT((x) => ({ ...x, ...p }))} base={base} recarregarBase={recarregarBase} avisar={avisar} cpfFixo />
            {prob.length ? <p className="text-[13px] font-bold text-[#7A5D00] dark:text-[#F2CB3F]">Falta: {prob.join(", ")}.</p> : null}
        </Janela>
    );
}

/** Transferência de titularidade (23/11/2026): falecimento do titular (7.1) ou a pedido (o antigo vira dependente). Sem taxa. */
function JanelaTransferir({ f, base, antigo, recarregarBase, avisar, onFechar, onSalvar }: { f: Ficha; base: Base; antigo: boolean; recarregarBase: () => Promise<unknown>; avisar: (m: string) => void; onFechar: () => void; onSalvar: (corpo: Record<string, unknown>) => Promise<unknown> }) {
    const c = f.contrato;
    const falecido = c.titular_falecido;
    const atual = f.beneficiarios.find((b) => b.tipo === "titular" && b.situacao === "ativo");
    const candidatos = f.beneficiarios.filter((b) => b.situacao === "ativo" && (b.tipo === "dependente" || b.tipo === "agregado") && (b.idade === null || b.idade >= 18));
    const sucessor = falecido ? candidatos.find((b) => b.sucessor) : undefined;
    const d = c.titular_dados;
    const endereco = { cep: d.cep ?? "", cidade_id: d.cidade_id ?? null, bairro_id: d.bairro_id ?? null, rua: d.rua ?? "", numero: d.numero ?? "", complemento: d.complemento ?? "" };
    const formDe = (id: number | null): TitularForm => {
        const b = candidatos.find((x) => x.id === id);
        if (!b) return { ...titularVazio(), ...endereco };
        return { ...titularVazio(), ...endereco, ...titularDeDados({ cpf: b.cpf_num || undefined, nome: b.nome, nascimento: b.nascimento, sexo: b.sexo }) };
    };
    const [escolha, setEscolha] = useState<number | null>(sucessor ? sucessor.id : null);
    const [t, setT] = useState<TitularForm>(formDe(sucessor ? sucessor.id : null));
    const [parAntigo, setParAntigo] = useState<string | null>(null);
    const [salvando, salvar] = useSalvando(onSalvar);
    const prob = escolha === null ? [] : titularProblemas(t, base.hoje);
    const ok = escolha !== null && !prob.length && (falecido || !!parAntigo);
    const opcoes = [
        ...candidatos.map((b) => ({ v: b.id, t: b.nome, s: [b.sucessor ? "Sucessor" : null, b.parentesco, b.idade !== null ? `${b.idade} anos` : null].filter(Boolean).join(" · ") })),
        ...(antigo ? [{ v: -1, t: "Pessoa de fora do contrato", s: "familiar que veio ao escritório" }] : []),
    ];
    return (
        <Janela
            titulo="Transferir titularidade"
            sub={falecido ? "Titular falecido: sucessão do contrato (cláusula 7.1)." : `A pedido: ${atual?.nome || c.titular} continua no contrato como dependente.`}
            largura="max-w-4xl"
            onFechar={onFechar}
            rodape={
                <Rodape
                    onFechar={onFechar}
                    ok={ok}
                    salvando={salvando}
                    botao="Transferir"
                    onOk={() => void salvar({ beneficiario_id: escolha !== null && escolha > 0 ? escolha : null, titular: titularParaEnvio(t, base.hoje), parentesco_antigo: falecido ? null : parAntigo })}
                />
            }
        >
            <div>
                <span className={ROTULO}>Novo titular</span>
                {opcoes.length ? (
                    <Combo
                        rotulo="Novo titular"
                        opcoes={opcoes}
                        valor={escolha}
                        onChange={(v) => {
                            setEscolha(v);
                            setT(formDe(v));
                        }}
                    />
                ) : (
                    <p className={SUB}>Nenhum beneficiário maior de idade no contrato. Planos novos: inclua a pessoa como beneficiário antes de transferir.</p>
                )}
            </div>
            {escolha !== null ? (
                <>
                    <CamposTitular t={t} set={(p) => setT((x) => ({ ...x, ...p }))} base={base} recarregarBase={recarregarBase} avisar={avisar} />
                    {prob.length ? <p className="text-[13px] font-bold text-[#7A5D00] dark:text-[#F2CB3F]">Falta: {prob.join(", ")}.</p> : null}
                </>
            ) : null}
            {!falecido ? (
                <div>
                    <span className={ROTULO}>Parentesco de {atual?.nome || c.titular} com o novo titular</span>
                    <Combo rotulo="Parentesco" opcoes={base.listas.parentescos.map((e) => ({ v: e, t: e }))} valor={parAntigo} onChange={setParAntigo} />
                </div>
            ) : null}
            <div className={NOTA}>
                {antigo
                    ? "Plano antigo: assume o cônjuge, o filho mais velho ou o familiar que vier ao escritório. Beneficiário do contrato mantém as carências; pessoa de fora cumpre carência a partir de hoje."
                    : "Planos novos: assume um beneficiário do contrato, maior de idade, que mantém as carências. Depois, indique o novo sucessor."}{" "}
                Sem taxa: fica registrado em Aditivos e vendas e no histórico. O parentesco dos outros dependentes não muda sozinho.
            </div>
        </Janela>
    );
}

function JanelaSair({ b, motivo, base, onFechar, onSalvar }: { b: Beneficiario; motivo: "excluido" | "falecido"; base: Base; onFechar: () => void; onSalvar: (data: string) => Promise<unknown> }) {
    const [data, setData] = useState(hojeISO().split("-").reverse().join("/"));
    const iso = dataValidar(data, base.hoje, false)[0];
    const [salvando, salvar] = useSalvando(onSalvar);
    return (
        <Janela
            titulo={motivo === "falecido" ? `Registrar falecimento: ${b.nome}` : `Excluir: ${b.nome}`}
            onFechar={onFechar}
            rodape={<Rodape onFechar={onFechar} ok={!!iso} salvando={salvando} botao={motivo === "falecido" ? "Registrar falecimento" : "Excluir"} onOk={() => void salvar(iso)} />}
        >
            <CampoData valor={data} onChange={setData} hoje={base.hoje} rotulo={motivo === "falecido" ? "Data do falecimento" : "Data da exclusão"} rotuloCls={ROTULO} nascimento={false} />
            <div className={NOTA}>
                {motivo === "falecido"
                    ? b.tipo === "titular"
                        ? "Titular falecido: o sucessor tem 30 dias para aceitar o contrato (cláusula 7.1). Use só quando o atendimento não foi do PAI."
                        : "Use só quando o atendimento não foi do PAI; com atendimento do PAI, confirme em \"Falecimentos a confirmar\"."
                    : "A exclusão encerra o valor do extra (se for pago) e fica no histórico."}
            </div>
        </Janela>
    );
}

function JanelaEscolha({ titulo, rotulo, opcoes, nota, onFechar, onSalvar }: { titulo: string; rotulo: string; opcoes: { v: number; t: string; s?: string }[]; nota: string; onFechar: () => void; onSalvar: (v: number) => Promise<unknown> }) {
    const [v, setV] = useState<number | null>(null);
    const [salvando, salvar] = useSalvando(onSalvar);
    return (
        <Janela titulo={titulo} onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={!!v} salvando={salvando} botao="Salvar" onOk={() => void salvar(v)} />}>
            <div>
                <span className={ROTULO}>{rotulo}</span>
                {opcoes.length ? <Combo rotulo={rotulo} opcoes={opcoes} valor={v} onChange={setV} /> : <p className={SUB}>Nenhuma opção disponível.</p>}
            </div>
            <div className={NOTA}>{nota}</div>
        </Janela>
    );
}

function JanelaBonificar({ f, ativos, onFechar, onSalvar }: { f: Ficha; ativos: Beneficiario[]; onFechar: () => void; onSalvar: (corpo: Record<string, unknown>) => Promise<unknown> }) {
    const [alvo, setAlvo] = useState<"mensalidade" | "aditivo" | "beneficiario" | null>("mensalidade");
    const [ref, setRef] = useState<number | null>(null);
    const [modo, setModo] = useState<"total" | "percentual" | "valor" | null>("total");
    const [valor, setValor] = useState("");
    const hoje = hojeISO();
    const meses = Array.from({ length: 25 }, (_, i) => {
        const d = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return { v: ym, t: mesBRCurto(ym) };
    });
    const [desde, setDesde] = useState<string | null>(meses[1].v);
    const [ate, setAte] = useState<string | null>(null);
    const [motivo, setMotivo] = useState("");
    const [salvando, salvar] = useSalvando(onSalvar);
    const aditivos = f.vendas.filter((v) => v.tipo === "aditivo" && v.situacao === "ativa");
    const pagos = ativos.filter((b) => b.pago);
    const ok = !!alvo && !!modo && !!desde && !!motivo.trim() && (alvo === "mensalidade" || !!ref) && (modo === "total" || Number(valor.replace(",", ".")) > 0) && (!ate || ate >= desde);
    return (
        <Janela
            titulo="Bonificar"
            sub="O pedido vai para a aprovação da Gestão."
            onFechar={onFechar}
            rodape={
                <Rodape
                    onFechar={onFechar}
                    ok={ok}
                    salvando={salvando}
                    botao="Pedir bonificação"
                    onOk={() => void salvar({ alvo, venda_id: alvo === "aditivo" ? ref : null, beneficiario_id: alvo === "beneficiario" ? ref : null, modo, valor: modo === "total" ? 100 : valor, desde, ate, motivo })}
                />
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <span className={ROTULO}>O que bonificar</span>
                    <Combo
                        rotulo="O que bonificar"
                        opcoes={[
                            { v: "mensalidade", t: "Mensalidade" },
                            ...(aditivos.length ? [{ v: "aditivo", t: "Aditivo" }] : []),
                            ...(pagos.length ? [{ v: "beneficiario", t: "Beneficiário pago" }] : []),
                        ]}
                        valor={alvo}
                        onChange={(v) => {
                            setAlvo(v as any);
                            setRef(null);
                        }}
                    />
                </div>
                {alvo === "aditivo" ? (
                    <div>
                        <span className={ROTULO}>Aditivo</span>
                        <Combo rotulo="Aditivo" opcoes={aditivos.map((a) => ({ v: a.id, t: a.aditivo || "", s: brl(a.valor_mensal) }))} valor={ref} onChange={setRef} />
                    </div>
                ) : alvo === "beneficiario" ? (
                    <div>
                        <span className={ROTULO}>Beneficiário</span>
                        <Combo rotulo="Beneficiário" opcoes={pagos.map((b) => ({ v: b.id, t: b.nome, s: brl(b.valor_mensal) }))} valor={ref} onChange={setRef} />
                    </div>
                ) : (
                    <div />
                )}
                <div>
                    <span className={ROTULO}>Quanto</span>
                    <Combo
                        rotulo="Quanto"
                        opcoes={[
                            { v: "total", t: "100%" },
                            { v: "percentual", t: "Percentual (%)" },
                            { v: "valor", t: "Valor (R$)" },
                        ]}
                        valor={modo}
                        onChange={(v) => setModo(v as any)}
                    />
                </div>
                {modo !== "total" ? (
                    <label className="block">
                        <span className={ROTULO}>{modo === "percentual" ? "Percentual" : "Valor por mês (R$)"}</span>
                        <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
                    </label>
                ) : (
                    <div />
                )}
                <div>
                    <span className={ROTULO}>A partir de</span>
                    <Combo rotulo="A partir de" opcoes={meses} valor={desde} onChange={setDesde} />
                </div>
                <div>
                    <span className={ROTULO}>Até</span>
                    <Combo rotulo="Até" opcoes={meses} valor={ate} onChange={setAte} vazio="Sem prazo (ilimitado)" />
                </div>
                <label className="block sm:col-span-2">
                    <span className={ROTULO}>Motivo</span>
                    <input className={CAMPO} value={motivo} placeholder="Ex.: indicou o contrato 016001" onChange={(e) => setMotivo(e.target.value)} />
                </label>
            </div>
        </Janela>
    );
}

function JanelaCancelar({ base, onFechar, onSalvar }: { base: Base; onFechar: () => void; onSalvar: (corpo: Record<string, unknown>) => Promise<unknown> }) {
    const [motivo, setMotivo] = useState<string | null>(null);
    const [data, setData] = useState(hojeISO().split("-").reverse().join("/"));
    const iso = dataValidar(data, base.hoje, false)[0];
    const [salvando, salvar] = useSalvando(onSalvar);
    return (
        <Janela titulo="Cancelar contrato" onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={!!iso && !!motivo} salvando={salvando} botao="Cancelar contrato" onOk={() => void salvar({ motivo, data: iso })} />}>
            <div>
                <span className={ROTULO}>Motivo</span>
                <Combo
                    rotulo="Motivo"
                    opcoes={["A pedido do titular", "Inadimplência", "Óbito do titular sem sucessor", "Transferido para outro contrato", "Cadastro de teste"].map((m) => ({ v: m, t: m }))}
                    valor={motivo}
                    onChange={setMotivo}
                />
            </div>
            <CampoData valor={data} onChange={setData} hoje={base.hoje} rotulo="Data do cancelamento" rotuloCls={ROTULO} nascimento={false} />
            <div className={NOTA}>Regra de Cancelamento: aviso de 20 dias e ressarcimento após uso (cláusula 8.5). O cálculo do ressarcimento entra com o financeiro do contrato (fase 3).</div>
        </Janela>
    );
}
