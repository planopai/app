"use client";

/**
 * Aba Financeiro da ficha do contrato (Contratos · fase 3A, 26/11/2026). Prévia aprovada "Mensalidades do Contrato".
 * Fala com o ct_mensalidades.php: parcelas (atrasadas e futuras; Todas; Só pagas), composição da mensalidade, situação
 * pela regra, receber (parcial e antecipado), 1º carnê e carnê para imprimir. Contrato de teste: recebimento só no histórico.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { IconBrandWhatsapp, IconChevronDown, IconChevronRight, IconCopy, IconLink, IconPrinter, IconReceipt } from "@tabler/icons-react";
import { api, BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CAMPO, CARTAO, ERRO, Janela, mensagemErro, NOTA, PILULA, ROTULO, S_AB, S_AVISO, S_MUDO, S_OK, S_RUIM, SELO, SUB } from "../../contas-pagar/components/fin";
import { brl, CampoData, Combo, dataValidar, isoParaBR, mesBRCurto } from "./ct";

export const URL_MENS = "https://api.planoassistencialintegrado.com.br/ct_mensalidades.php";

type Pagamento = { id: number; data: string; principal: number; multa: number; juros: number; pago: number; forma: string | null; teste: boolean };
type Parcela = {
    id: number;
    numero: number | null;
    competencia: string;
    vencimento: string;
    vence_util: string;
    valor: number;
    situacao: "ABERTO" | "PAGO" | "CANCELADO";
    pago: number;
    saldo: number;
    multa: number;
    juros: number;
    dias: number;
    hoje: number;
    parcela: string | null;
    ciclo_id: number | null;
    teste: boolean;
    itens: { tipo: string; descricao: string; valor: number }[];
    pagamentos: Pagamento[];
};
type Ciclo = { id: number; numero: number; primeiro: string; ultimo: string; parcelas: number; valor_plano: number; reajuste_pct: number | null; modo: string };
type Dados = {
    contrato: { id: number; numero: string; situacao: string; situacao_motivo: string | null; dia_pagamento: number; forma_cobranca: string; teste: boolean };
    resumo: { atraso: number; vencidas: number; proxima: { valor: number; vencimento: string } | null; abertas: number; pagas_ciclo: number; parcelas_ciclo: number; ciclo_atual: Ciclo | null; parciais: number; pagas_total: number };
    situacao_calc: { situacao: string; motivo: string; dias: number; vencidas: number; rescisao: boolean } | null;
    composicao: { itens: { tipo: string; descricao: string; valor: number }[]; total: number } | null;
    ciclos: Ciclo[];
    parcelas: Parcela[];
    regra: { antecipar: boolean; multa: number; juros: number; parcelas: number };
};
type BaseMens = {
    hoje: string;
    contas: { id: number; nome: string; tipo: string }[];
    formas: { id: number; codigo: string; nome: string }[];
    cobradores: { id: number; nome: string }[];
    pode: { gestao: boolean; renovar: boolean; receber: boolean };
    sicredi?: { pix: string[]; boleto: string[] };
};
type Cobranca = {
    id: number;
    tipo: "PIX" | "BOLETO";
    situacao: "ATIVA" | "PAGA" | "CANCELADA" | "EXPIRADA" | "CONFERIR" | "ERRO";
    valor: number;
    criado_em: string;
    vencimento: string | null;
    expira_em: string | null;
    pago_em: string | null;
    valor_pago: number | null;
    obs: string | null;
    origem: string;
};
type LinkPag = { url: string; expira_em: string; valor: number; texto: string; mensagem: string; whatsapp: string };
const SIT_COB: Record<Cobranca["situacao"], [string, string]> = {
    ATIVA: ["Aguardando pagamento", S_AB],
    PAGA: ["Paga · baixa automática", S_OK],
    CANCELADA: ["Cancelada", S_MUDO],
    EXPIRADA: ["Venceu", S_MUDO],
    CONFERIR: ["Paga · conferir a baixa", S_RUIM],
    ERRO: ["Não gerada", S_MUDO],
};
type Filtro = "abertas" | "todas" | "pagas";

const SIT_NOME: Record<string, [string, string]> = {
    ativo: ["Ativo", S_OK],
    suspenso: ["Suspenso", S_AVISO],
    juridico: ["Cobrança jurídica", S_RUIM],
};
const TH = "px-2 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
const TD = "px-2 py-2.5 align-top";
const TR = "border-t border-[#E3E8F0] dark:border-white/[0.08]";
const NUM = "text-right tabular-nums";

const cicloAtual = (d: Dados) => d.resumo.ciclo_atual ?? (d.ciclos.length ? d.ciclos[d.ciclos.length - 1] : null);

function seloParcela(p: Parcela, hoje: string): [string, string] {
    if (p.situacao === "PAGO") return ["Paga", S_OK];
    if (p.situacao === "CANCELADO") return ["Cancelada", S_MUDO];
    if (p.dias > 0) return [p.pago > 0 ? `Parcial · ${p.dias} dias` : `Atrasada · ${p.dias} dias`, S_RUIM];
    if (p.vencimento < hoje) return ["Venceu · no prazo do dia útil", S_AVISO];
    return [p.pago > 0 ? "Parcial" : "Em aberto", p.pago > 0 ? S_AVISO : S_AB];
}

export default function Financeiro({ contratoId, avisar, onMudou }: { contratoId: number; avisar: (m: string) => void; onMudou: () => void }) {
    const [base, setBase] = useState<BaseMens | null>(null);
    const [d, setD] = useState<Dados | null>(null);
    const [filtro, setFiltro] = useState<Filtro>("abertas");
    const [erro, setErro] = useState("");
    const [marc, setMarc] = useState<number[]>([]);
    const [aberta, setAberta] = useState<number | null>(null);
    const [receber, setReceber] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [cobs, setCobs] = useState<Cobranca[]>([]);
    const [link, setLink] = useState<LinkPag | null>(null);
    const [gerandoLink, setGerandoLink] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_MENS, "parcelas", undefined, `&contrato_id=${contratoId}&filtro=${filtro}`);
            setD(j.dados);
            setErro("");
            setMarc((m) => m.filter((id) => (j.dados.parcelas as Parcela[]).some((p) => p.id === id && p.situacao === "ABERTO")));
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível abrir as parcelas.");
            if (m) setErro(m);
        }
    }, [contratoId, filtro]);
    const carregarCobs = useCallback(async () => {
        try {
            const j = await api(URL_MENS, "cobrancas", undefined, `&contrato_id=${contratoId}`);
            setCobs(j.dados.cobrancas || []);
        } catch {
            setCobs([]);
        }
    }, [contratoId]);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    useEffect(() => {
        void carregarCobs();
    }, [carregarCobs]);
    useEffect(() => {
        (async () => {
            try {
                const j = await api(URL_MENS, "base");
                setBase(j.dados);
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível carregar as formas de recebimento.");
                if (m) setErro(m);
            }
        })();
    }, []);

    const depois = useCallback(async () => {
        await carregar();
        await carregarCobs();
        onMudou();
    }, [carregar, carregarCobs, onMudou]);

    const gerarLink = async () => {
        setGerandoLink(true);
        try {
            const j = await api(URL_MENS, "link", { contrato_id: contratoId });
            setLink(j.dados);
            await carregarCobs();
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível gerar o link.");
            if (m) avisar(m);
        } finally {
            setGerandoLink(false);
        }
    };
    const acaoCob = async (acao: "cobranca_conferir" | "cobranca_cancelar", id: number) => {
        try {
            const j = await api(URL_MENS, acao, { id });
            avisar(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível falar com o Sicredi agora.");
            if (m) avisar(m);
        }
        await depois();
    };

    const gerar = async () => {
        setGerando(true);
        try {
            const j = await api(URL_MENS, "gerar", { contrato_id: contratoId });
            avisar(j.msg);
            await depois();
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível gerar o carnê.");
            if (m) avisar(m);
        } finally {
            setGerando(false);
        }
    };

    if (erro) return <div className={ERRO}>{erro}</div>;
    if (!d || !base) return <div className={SUB}>Carregando as parcelas…</div>;
    const c = d.contrato;
    const r = d.resumo;
    const hoje = base.hoje;
    const ultimo = cicloAtual(d);
    const sit = d.situacao_calc ? SIT_NOME[d.situacao_calc.situacao] : null;
    const marcadas = d.parcelas.filter((p) => marc.includes(p.id));
    const alternar = (id: number) => setMarc((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    const abertasVisiveis = d.parcelas.filter((p) => p.situacao === "ABERTO");
    const todasMarcadas = abertasVisiveis.length > 0 && abertasVisiveis.every((p) => marc.includes(p.id));

    return (
        <div className="flex min-w-0 flex-col gap-4">
            {c.teste ? (
                <div className={NOTA}>
                    <span>
                        <b>Contrato de teste.</b> As parcelas não entram no Contas a Receber, na Tesouraria, na DRE nem no fluxo de caixa, e o recebimento fica só no histórico (sem caixa nem banco).
                    </span>
                </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Cartao rotulo="Em atraso" valor={r.atraso > 0 ? brl(r.atraso) : "—"} sub={r.vencidas ? `${r.vencidas} parcela(s), com multa e juros de hoje` : "nenhuma parcela vencida"} ruim={r.atraso > 0} />
                <Cartao rotulo="Próxima" valor={r.proxima ? brl(r.proxima.valor) : "—"} sub={r.proxima ? `vence ${isoParaBR(r.proxima.vencimento)}` : ultimo ? "carnê sem parcelas futuras" : "sem carnê"} />
                <Cartao
                    rotulo="Pagas no carnê"
                    valor={ultimo ? `${r.pagas_ciclo} de ${r.parcelas_ciclo}` : "—"}
                    sub={r.parciais ? `${r.parciais} com pagamento parcial` : ultimo ? `carnê ${ultimo.numero}: ${mesBRCurto(ultimo.primeiro.slice(0, 7))} a ${mesBRCurto(ultimo.ultimo.slice(0, 7))}` : ""}
                />
                <Cartao
                    rotulo="Situação pela regra"
                    valor={sit ? sit[0] : "—"}
                    sub={d.situacao_calc ? d.situacao_calc.motivo + (d.situacao_calc.rescisao ? " · mais mensalidades vencidas que a regra de rescisão" : "") : "contrato fora de cobrança"}
                    ruim={d.situacao_calc?.situacao === "juridico"}
                />
            </div>

            {d.composicao ? (
                <div className="rounded-xl bg-[#F6F8FB] px-4 py-3 dark:bg-[#1C2334]">
                    <div className={ROTULO}>Mensalidade de hoje</div>
                    <ul className="flex flex-col gap-1 text-[14.5px]">
                        {d.composicao.itens.map((i, k) => (
                            <li key={k} className="flex justify-between gap-3">
                                <span className="min-w-0 break-words">{i.descricao}</span>
                                <span className={`${NUM} ${i.valor < 0 ? "text-[#3F5A0A] dark:text-[#CFE38A]" : ""}`}>{i.valor < 0 ? `− ${brl(-i.valor)}` : brl(i.valor)}</span>
                            </li>
                        ))}
                        <li className="mt-1 flex justify-between gap-3 border-t border-[#E3E8F0] pt-1.5 font-extrabold dark:border-white/[0.08]">
                            <span>Parcela</span>
                            <span className={NUM}>{brl(d.composicao.total)}</span>
                        </li>
                    </ul>
                    <div className={`${SUB} mt-1.5`}>O título no Contas a Receber é do valor cheio; a divisão fica guardada só para a Análise.</div>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                {base.pode.receber && c.situacao !== "cancelado" ? (
                    <button type="button" className={BTN_PEQ_PRI} disabled={!marcadas.length} onClick={() => setReceber(true)}>
                        <IconReceipt size={16} /> Receber{marcadas.length ? ` (${marcadas.length})` : ""}
                    </button>
                ) : null}
                {d.ciclos.map((k) => (
                    <a key={k.id} className={BTN_PEQ} href={`${URL_MENS}?action=carne&ciclo_id=${k.id}`} target="_blank" rel="noreferrer">
                        <IconPrinter size={16} /> Carnê {k.numero} ({mesBRCurto(k.primeiro.slice(0, 7))} a {mesBRCurto(k.ultimo.slice(0, 7))})
                    </a>
                ))}
                {base.pode.receber && ["ativo", "suspenso", "juridico"].includes(c.situacao) && r.abertas > 0 ? (
                    <button type="button" className={BTN_PEQ} disabled={gerandoLink} onClick={gerarLink}>
                        <IconLink size={16} /> {gerandoLink ? "Gerando…" : "Link de pagamento"}
                    </button>
                ) : null}
                {!d.ciclos.length && ["ativo", "suspenso", "juridico"].includes(c.situacao) ? (
                    <button type="button" className={BTN_PEQ_PRI} disabled={gerando} onClick={gerar}>
                        {gerando ? "Gerando…" : "Gerar o 1º carnê"}
                    </button>
                ) : null}
                <span className={SUB}>
                    {marcadas.length
                        ? `${marcadas.length} marcada(s) · ${brl(marcadas.reduce((s, p) => s + p.hoje, 0))} hoje`
                        : `Marque as parcelas para receber${d.regra.antecipar ? " (antecipar é permitido pela regra)" : ""}.`}
                </span>
            </div>

            <div role="tablist" className="flex flex-wrap gap-2">
                {(
                    [
                        ["abertas", "Atrasadas e futuras"],
                        ["todas", "Todas"],
                        ["pagas", "Só pagas"],
                    ] as [Filtro, string][]
                ).map(([k, n]) => (
                    <button key={k} type="button" role="tab" aria-selected={filtro === k} className={PILULA(filtro === k)} onClick={() => setFiltro(k)}>
                        {n}
                    </button>
                ))}
            </div>

            {d.parcelas.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[14.5px]">
                        <thead>
                            <tr>
                                <th className={`${TH} w-10`}>
                                    {abertasVisiveis.length ? (
                                        <input
                                            type="checkbox"
                                            aria-label="Marcar todas em aberto"
                                            className="size-5 accent-[#313C55]"
                                            checked={todasMarcadas}
                                            onChange={() => setMarc(todasMarcadas ? [] : abertasVisiveis.map((p) => p.id))}
                                        />
                                    ) : null}
                                </th>
                                <th className={TH}>Parcela nº</th>
                                <th className={TH}>Referência</th>
                                <th className={TH}>Vencimento</th>
                                <th className={`${TH} text-right`}>Valor</th>
                                <th className={`${TH} text-right`}>Pago</th>
                                <th className={`${TH} text-right`}>Hoje</th>
                                <th className={TH}>Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {d.parcelas.map((p) => {
                                const [sn, sc] = seloParcela(p, hoje);
                                const ab = aberta === p.id;
                                return (
                                    <React.Fragment key={p.id}>
                                        <tr className={`${TR} ${marc.includes(p.id) ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : ""}`}>
                                            <td className={TD}>
                                                {p.situacao === "ABERTO" && c.situacao !== "cancelado" ? (
                                                    <input type="checkbox" aria-label={`Marcar a parcela ${p.numero ?? ""}`} className="size-5 accent-[#313C55]" checked={marc.includes(p.id)} onChange={() => alternar(p.id)} />
                                                ) : null}
                                            </td>
                                            <td className={TD}>
                                                <button type="button" className="inline-flex items-center gap-1 font-extrabold" onClick={() => setAberta(ab ? null : p.id)} aria-expanded={ab}>
                                                    {ab ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                                    {p.numero ?? "—"}
                                                </button>
                                            </td>
                                            <td className={TD}>{mesBRCurto(p.competencia)}</td>
                                            <td className={TD}>
                                                {isoParaBR(p.vencimento)}
                                                {p.vence_util !== p.vencimento && p.situacao === "ABERTO" ? <div className={SUB}>sem encargos até {isoParaBR(p.vence_util)}</div> : null}
                                            </td>
                                            <td className={`${TD} ${NUM}`}>{brl(p.valor)}</td>
                                            <td className={`${TD} ${NUM}`}>{p.pago ? brl(p.pago) : "—"}</td>
                                            <td className={`${TD} ${NUM} font-extrabold`}>
                                                {p.situacao === "ABERTO" ? brl(p.hoje) : "—"}
                                                {p.multa + p.juros > 0 ? <div className={`${SUB} font-normal`}>+ {brl(p.multa + p.juros)} encargos</div> : null}
                                            </td>
                                            <td className={TD}>
                                                <span className={`${SELO} ${sc}`}>{sn}</span>
                                            </td>
                                        </tr>
                                        {ab ? (
                                            <tr>
                                                <td />
                                                <td colSpan={7} className="px-2 pb-3">
                                                    <div className="grid gap-3 rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] dark:bg-[#1C2334] lg:grid-cols-2">
                                                        <div>
                                                            <div className={ROTULO}>Composição</div>
                                                            {p.itens.length ? (
                                                                p.itens.map((i, k) => (
                                                                    <div key={k} className="flex justify-between gap-3">
                                                                        <span className="min-w-0 break-words">{i.descricao}</span>
                                                                        <span className={NUM}>{i.valor < 0 ? `− ${brl(-i.valor)}` : brl(i.valor)}</span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className={SUB}>Parcela migrada (sem a divisão).</span>
                                                            )}
                                                            {p.parcela ? <div className={`${SUB} mt-1`}>Parcela {p.parcela} do carnê.</div> : null}
                                                        </div>
                                                        <div>
                                                            <div className={ROTULO}>Recebimentos</div>
                                                            {p.pagamentos.length ? (
                                                                p.pagamentos.map((g) => (
                                                                    <div key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                                                                        <span>
                                                                            {isoParaBR(g.data)} · {g.forma || "—"} · {brl(g.pago)}
                                                                            {g.multa + g.juros > 0 ? <span className={SUB}> (parcela {brl(g.principal)} + encargos {brl(g.multa + g.juros)})</span> : null}
                                                                        </span>
                                                                        {!g.teste ? (
                                                                            <a className="font-extrabold underline" href={`${URL_MENS}?action=recibo&baixa_id=${g.id}`} target="_blank" rel="noreferrer">
                                                                                Recibo
                                                                            </a>
                                                                        ) : (
                                                                            <span className={SUB}>teste</span>
                                                                        )}
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className={SUB}>Nenhum.</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className={NOTA}>
                    <span>
                        {filtro === "pagas"
                            ? "Nenhuma parcela paga."
                            : filtro === "abertas"
                              ? d.ciclos.length
                                  ? "Nenhuma parcela em aberto: o contrato está em dia e o carnê terminou. Renove na Renovação de carnês."
                                  : "Este contrato ainda não tem carnê."
                              : "Nenhuma parcela."}
                    </span>
                </div>
            )}
            <div className={SUB}>
                Vencimento no sábado, domingo ou feriado: sem multa e juros até o próximo dia útil. Parcela paga em parte fica em aberto e só vira Paga quando o restante entra. Multa {String(d.regra.multa).replace(".", ",")}% e juros {String(d.regra.juros).replace(".", ",")}% ao mês (regra de Cobrança).
            </div>

            {cobs.length ? (
                <div className="flex flex-col gap-2">
                    <div className={ROTULO}>Pix e boletos do Sicredi</div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-[14px]">
                            <thead>
                                <tr>
                                    <th className={TH}>Gerado em</th>
                                    <th className={TH}>Tipo</th>
                                    <th className={`${TH} text-right`}>Valor</th>
                                    <th className={TH}>Situação</th>
                                    <th className={TH}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {cobs.map((k) => (
                                    <tr key={k.id} className={TR}>
                                        <td className={TD}>
                                            {isoParaBR(k.criado_em)} {k.criado_em.slice(11, 16)}
                                            <div className={SUB}>{k.origem}</div>
                                        </td>
                                        <td className={TD}>
                                            {k.tipo === "PIX" ? "Pix" : "BolePix"}
                                            <div className={SUB}>{k.tipo === "PIX" ? (k.expira_em ? `vale até ${isoParaBR(k.expira_em)} ${k.expira_em.slice(11, 16)}` : "") : k.vencimento ? `vence ${isoParaBR(k.vencimento)}` : ""}</div>
                                        </td>
                                        <td className={`${TD} ${NUM}`}>
                                            {brl(k.valor)}
                                            {k.valor_pago !== null && Math.abs(k.valor_pago - k.valor) > 0.004 ? <div className={SUB}>pago {brl(k.valor_pago)}</div> : null}
                                        </td>
                                        <td className={TD}>
                                            <span className={`${SELO} ${SIT_COB[k.situacao][1]}`}>{SIT_COB[k.situacao][0]}</span>
                                            {k.pago_em ? <div className={SUB}>em {isoParaBR(k.pago_em)} {k.pago_em.slice(11, 16)}</div> : null}
                                            {k.obs ? <div className={`${SUB} break-words`}>{k.obs}</div> : null}
                                        </td>
                                        <td className={`${TD} text-right`}>
                                            {k.situacao === "ATIVA" && base.pode.receber ? (
                                                <div className="flex flex-wrap justify-end gap-1.5">
                                                    <button type="button" className={BTN_PEQ} onClick={() => void acaoCob("cobranca_conferir", k.id)}>
                                                        Conferir agora
                                                    </button>
                                                    <button type="button" className={BTN_PEQ} onClick={() => void acaoCob("cobranca_cancelar", k.id)}>
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className={SUB}>Pago pelo link: a baixa é automática (o sistema consulta o Sicredi a cada 5 minutos), sem multa e juros. Recebido no balcão: os Pix e boletos em aberto são cancelados no Sicredi.</div>
                </div>
            ) : null}

            {link ? <JanelaLink link={link} teste={c.teste} onFechar={() => setLink(null)} avisar={avisar} /> : null}

            {receber && marcadas.length ? (
                <JanelaReceber
                    base={base}
                    dados={d}
                    marcadas={marcadas}
                    onFechar={() => setReceber(false)}
                    onFeito={async (msg) => {
                        avisar(msg);
                        setReceber(false);
                        setMarc([]);
                        await depois();
                    }}
                />
            ) : null}
        </div>
    );
}

function JanelaLink({ link, teste, onFechar, avisar }: { link: LinkPag; teste: boolean; onFechar: () => void; avisar: (m: string) => void }) {
    const copiar = async (t: string, o: string) => {
        try {
            await navigator.clipboard.writeText(t);
            avisar(`${o} copiado.`);
        } catch {
            avisar("Não consegui copiar: selecione o texto e copie.");
        }
    };
    const wa = link.whatsapp ? `https://wa.me/${link.whatsapp}?text=${encodeURIComponent(link.mensagem)}` : `https://wa.me/?text=${encodeURIComponent(link.mensagem)}`;
    return (
        <Janela
            titulo="Link de pagamento"
            sub={`${brl(link.valor)} · ${link.texto} · vale até ${isoParaBR(link.expira_em)} ${link.expira_em.slice(11, 16)}`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <a className={BTN_PRI} href={wa} target="_blank" rel="noreferrer">
                        <IconBrandWhatsapp size={18} /> Abrir no WhatsApp
                    </a>
                </>
            }
        >
            <div>
                <span className={ROTULO}>Mensagem</span>
                <div className="whitespace-pre-wrap break-words rounded-xl bg-[#F1F4F8] px-3.5 py-3 text-[14.5px] dark:bg-[#1C2334]">{link.mensagem}</div>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PEQ} onClick={() => void copiar(link.mensagem, "Mensagem")}>
                    <IconCopy size={16} /> Copiar mensagem
                </button>
                <button type="button" className={BTN_PEQ} onClick={() => void copiar(link.url, "Link")}>
                    <IconCopy size={16} /> Copiar só o link
                </button>
                <a className={BTN_PEQ} href={link.url} target="_blank" rel="noreferrer">
                    <IconLink size={16} /> Abrir a página
                </a>
            </div>
            <div className={NOTA}>
                <span>
                    O cliente paga por Pix ou BolePix do Sicredi, sem multa e juros{teste ? ". Contrato de teste: o dinheiro do Pix entra de verdade na conta Sicredi, mas a parcela só baixa no histórico" : ", e a baixa é automática"}. O link
                    vale 3 dias. &quot;Abrir no WhatsApp&quot; usa o WhatsApp deste computador ou celular.
                </span>
            </div>
        </Janela>
    );
}

function Cartao({ rotulo, valor, sub, ruim }: { rotulo: string; valor: string; sub?: string; ruim?: boolean }) {
    return (
        <div className={`${CARTAO} flex min-w-0 flex-col gap-0.5 px-3.5 py-3`}>
            <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</span>
            <span className={`text-[20px] font-extrabold leading-tight ${ruim ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}>{valor}</span>
            {sub ? <span className={`${SUB} break-words`}>{sub}</span> : null}
        </div>
    );
}

function JanelaReceber({ base, dados, marcadas, onFechar, onFeito }: { base: BaseMens; dados: Dados; marcadas: Parcela[]; onFechar: () => void; onFeito: (msg: string) => Promise<void> }) {
    const teste = dados.contrato.teste;
    const [cobrar, setCobrar] = useState(true);
    const total = useMemo(() => Math.round(marcadas.reduce((s, p) => s + (cobrar ? p.hoje : p.saldo), 0) * 100) / 100, [marcadas, cobrar]);
    const [valor, setValor] = useState(total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
    useEffect(() => {
        setValor(total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
    }, [total]);
    const [data, setData] = useState(isoParaBR(base.hoje));
    const [forma, setForma] = useState<string | null>(null);
    const [conta, setConta] = useState<number | null>(null);
    const [cobrador, setCobrador] = useState<number | null>(null);
    const [nsu, setNsu] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [falha, setFalha] = useState("");
    const dinheiro = forma === "DINHEIRO";
    const cartao = forma === "CARTAO_DEBITO" || forma === "CARTAO_CREDITO";
    const contas = base.contas.filter((c) => (dinheiro ? c.tipo === "CAIXA" : c.tipo !== "CAIXA"));
    useEffect(() => {
        setConta((c) => (c && contas.some((x) => x.id === c) ? c : contas.length === 1 ? contas[0].id : null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forma]);
    const num = Number(valor.replace(/\./g, "").replace(",", "."));
    const diferenca = Number.isFinite(num) ? Math.round((num - total) * 100) / 100 : 0;

    const confirmar = async () => {
        setFalha("");
        const [iso, msgData] = dataValidar(data, base.hoje, false);
        if (!iso) return setFalha(msgData || "Data inválida.");
        if (!forma) return setFalha("Escolha a forma de recebimento.");
        if (!teste && !conta) return setFalha("Escolha a conta onde o dinheiro entrou.");
        if (!Number.isFinite(num) || num <= 0) return setFalha("Informe o valor recebido.");
        if (!teste && cartao && !nsu.trim()) return setFalha("Cartão: informe o NSU do comprovante.");
        setSalvando(true);
        try {
            const j = await api(URL_MENS, "receber", {
                contrato_id: dados.contrato.id,
                ids: marcadas.map((p) => p.id),
                valor: num,
                data: iso,
                forma,
                conta_id: conta,
                cobrar_encargos: cobrar,
                cobrador_id: cobrador,
                nsu,
            });
            await onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível receber.");
            if (m) setFalha(m);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela
            titulo={`Receber · contrato ${dados.contrato.numero}`}
            sub={`${marcadas.length} parcela(s)${teste ? " · contrato de teste" : ""}`}
            onFechar={onFechar}
            largura="max-w-2xl"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={confirmar}>
                        {salvando ? "Recebendo…" : "Receber"}
                    </button>
                </>
            }
        >
            <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-[14px]">
                    <thead>
                        <tr>
                            <th className={TH}>Parcela</th>
                            <th className={`${TH} text-right`}>Saldo</th>
                            <th className={`${TH} text-right`}>Multa</th>
                            <th className={`${TH} text-right`}>Juros</th>
                            <th className={`${TH} text-right`}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {marcadas.map((p) => (
                            <tr key={p.id} className={TR}>
                                <td className={TD}>
                                    {p.numero} · {mesBRCurto(p.competencia)}
                                </td>
                                <td className={`${TD} ${NUM}`}>{brl(p.saldo)}</td>
                                <td className={`${TD} ${NUM}`}>{cobrar ? brl(p.multa) : "—"}</td>
                                <td className={`${TD} ${NUM}`}>{cobrar ? brl(p.juros) : "—"}</td>
                                <td className={`${TD} ${NUM} font-extrabold`}>{brl(cobrar ? p.hoje : p.saldo)}</td>
                            </tr>
                        ))}
                        <tr className={TR}>
                            <td className={`${TD} font-extrabold`} colSpan={4}>
                                Total
                            </td>
                            <td className={`${TD} ${NUM} font-extrabold`}>{brl(total)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {marcadas.some((p) => p.multa + p.juros > 0) ? (
                base.pode.gestao ? (
                    <label className="flex min-h-11 items-center gap-2.5 text-[14.5px] font-bold">
                        <input type="checkbox" className="size-5 accent-[#313C55]" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} />
                        Cobrar multa e juros
                    </label>
                ) : (
                    <div className={SUB}>Receber sem multa e juros é desconto: só a Gestão faz.</div>
                )
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className={ROTULO}>Valor recebido</label>
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                    {diferenca < -0.004 ? <div className={`${SUB} mt-1`}>Menor que o total: pagamento parcial (abate primeiro multa e juros, depois a parcela mais antiga).</div> : null}
                    {diferenca > 0.004 ? (
                        <div className={`${SUB} mt-1`}>{dados.regra.antecipar ? `Maior que o total: ${brl(diferenca)} quitam as parcelas seguintes, na ordem.` : "Maior que o total: a regra do plano não permite antecipar."}</div>
                    ) : null}
                </div>
                <CampoData valor={data} onChange={setData} hoje={base.hoje} rotulo="Data do recebimento" rotuloCls={ROTULO} nascimento={false} />
                <div>
                    <span className={ROTULO}>Forma</span>
                    <Combo<string> rotulo="Forma" opcoes={base.formas.map((f) => ({ v: f.codigo, t: f.nome }))} valor={forma} onChange={setForma} placeholder="Escolha" />
                </div>
                {!teste ? (
                    <div>
                        <span className={ROTULO}>{dinheiro ? "Caixa" : "Conta do banco"}</span>
                        <Combo<number>
                            rotulo={dinheiro ? "Caixa" : "Conta do banco"}
                            opcoes={contas.map((c) => ({ v: c.id, t: c.nome }))}
                            valor={conta}
                            onChange={setConta}
                            placeholder={forma ? "Escolha" : "Escolha a forma primeiro"}
                            desativado={!forma}
                        />
                    </div>
                ) : null}
                {!teste && cartao ? (
                    <div>
                        <label className={ROTULO}>NSU do comprovante</label>
                        <input className={CAMPO} inputMode="numeric" value={nsu} onChange={(e) => setNsu(e.target.value)} />
                    </div>
                ) : null}
                {base.cobradores.length ? (
                    <div>
                        <span className={ROTULO}>Recebido por</span>
                        <Combo<number> rotulo="Recebido por" opcoes={base.cobradores.map((c) => ({ v: c.id, t: c.nome }))} valor={cobrador} onChange={setCobrador} vazio="Escritório" />
                    </div>
                ) : null}
            </div>
            {teste ? (
                <div className={NOTA}>
                    <span>Contrato de teste: o recebimento fica só no histórico do contrato, sem caixa, banco nem recibo.</span>
                </div>
            ) : (
                <div className={SUB}>Dinheiro entra no caixa aberto; Pix, cartão, boleto e transferência entram na conta do banco. Cada parcela ganha o seu recibo (botão Recibo na parcela).</div>
            )}
            {falha ? <div className={ERRO}>{falha}</div> : null}
        </Janela>
    );
}
