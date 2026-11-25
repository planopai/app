"use client";

/**
 * Propostas de Adesão (/propostas-adesao, chave propostas-adesao) — Administrativo — ambiente de vendas, prévia aprovada em 19/11/2026 (versão 5).
 * Back-end: ct_propostas.php. Sala de espera dos contratos novos: chega a venda já feita (Vender plano, Novo contrato,
 * ficha do WhatsApp e do site). 1. Para conferir → 2. Aguardando pagamento da adesão → 3. Adesão paga · gerar contrato.
 * O número do contrato só sai com a adesão paga. Até a virada, o número vem da Unymos (lançar lá e informar aqui);
 * a Gestão pode gerar um contrato de teste no Conecta.
 * Prazo: parada na mesma etapa por mais de 24 horas úteis fica em vermelho (sábado, domingo e feriados não contam: nacionais, 2 de Julho e os de Barreiras).
 *
 * 25/11/2026 (vendas unificadas no Comercial › Adesões): esta tela substitui Plano › Adesões › Site (/novos-planos) e
 * WhatsApp (/messenger-propostas), que agora redirecionam para cá. Filtro de origem (?origem=aurora|site|direta|admin),
 * coluna "Aguardando a ficha" (vendas do WhatsApp em que o cliente ainda não preencheu a ficha), "Pedido do site"
 * (o detalhe que ficava na tela Novos planos: recibo da Loja, família, observação, situação e histórico; ?site=<id> abre direto)
 * e "Abrir conversa". O número do contrato continua saindo só pelo "Gerar contrato".
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import BotoesReciboLoja from "@/app/coroa-de-flores/BotoesReciboLoja";
import { IconClipboardPlus } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import { api, BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CAMPO, CARTAO, ERRO, Janela, mensagemErro, NOTA, ROTULO, S_AB, S_MUDO, S_OK, S_RUIM, SELO, SUB, useAviso } from "../contas-pagar/components/fin";
import { brl, CampoData, Combo, dataValidar, isoParaBR, URL_PROP, useBase } from "../contratos/components/ct";
import Novo, { type DadosVenda } from "../contratos/components/Novo";

type Aba = "abertas" | "gerada" | "desistiu";

type Proposta = {
    id: number;
    origem: string;
    origem_nome: string;
    venda_direta: boolean;
    vendedor: string | null;
    vendedor_id: number | null;
    nome: string;
    cpf: string | null;
    telefone: string | null;
    plano_id: number | null;
    beneficiarios: number;
    valor_adesao: number;
    valor_mensal: number;
    etapa: "conferir" | "pagamento" | "paga" | "gerada" | "desistiu";
    etapa_nome: string;
    etapa_em: string;
    horas_uteis: number;
    atrasada: boolean;
    adesao_paga_em: string | null;
    adesao_forma: string | null;
    adesao_no_ato: boolean;
    contrato_id: number | null;
    contrato_numero: string | null;
    motivo_desistencia: string | null;
    criado_em: string;
    funil_id: number | null;
    planos_novos_id?: number | null;
    chat_proposta_id?: number | null;
    conversa_id?: number | null;
};

/** Venda do WhatsApp que ainda aguarda a ficha do cliente (chat_propostas). */
type Ficha = { id: number; conversa_id: number | null; nome: string | null; telefone: string | null; plano: string; origem: string | null; criado_em: string; mensalidade: number; adesao: number; vencida: boolean; pessoas: string[] };

type Lista = { linhas: Proposta[]; contratos_no_conecta: boolean; pode_teste: boolean; formas: Record<string, string>; fichas?: Ficha[] };

const ORIGENS: [string, string][] = [
    ["", "Todas"],
    ["aurora", "WhatsApp"],
    ["site", "Site"],
    ["direta", "Venda direta"],
    ["admin", "Administrativo"],
];

const COLUNAS: [Proposta["etapa"], string, string][] = [
    ["conferir", "Para conferir", "Conferir"],
    ["pagamento", "Aguardando pagamento da adesão", "Registrar pagamento"],
    ["paga", "Adesão paga · gerar contrato", "Gerar contrato"],
];

const quando = (iso: string) => `${isoParaBR(iso).slice(0, 5)} ${iso.slice(11, 16)}`;
const horasTexto = (h: number) => (h < 1 ? "menos de 1 hora útil" : h < 24 ? `${Math.floor(h)} h úteis` : `${Math.floor(h / 24)} dia(s) útil(eis)`);

export default function Page() {
    const { base, erro, recarregar } = useBase(URL_PROP);
    const { avisar, aviso } = useAviso();
    const [aba, setAba] = useState<Aba>("abertas");
    const [lista, setLista] = useState<Lista | null>(null);
    const [erroLista, setErroLista] = useState("");
    const [conferindo, setConferindo] = useState<{ p: Proposta; dados: DadosVenda } | null>(null);
    const [pagando, setPagando] = useState<Proposta | null>(null);
    const [gerando, setGerando] = useState<Proposta | null>(null);
    const [desistindo, setDesistindo] = useState<Proposta | null>(null);
    const [fichaDesistindo, setFichaDesistindo] = useState<Ficha | null>(null);
    const [origem, setOrigem] = useState("");
    const [busca, setBusca] = useState("");
    const [siteAberto, setSiteAberto] = useState<number | null>(null);

    // ?origem= (vindo dos endereços antigos) e ?site=<id> (link do aviso de novo plano pago)
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const o = q.get("origem") || "";
        if (ORIGENS.some(([k]) => k === o)) setOrigem(o);
        const site = Number(q.get("site") || 0);
        if (site > 0) setSiteAberto(site);
    }, []);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_PROP, "lista", undefined, `&mostrar=${aba}`);
            setLista(j.dados);
            setErroLista("");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível carregar as propostas.");
            if (m) setErroLista(m);
        }
    }, [aba]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const gravar = async (acao: string, corpo: Record<string, unknown>) => {
        try {
            const j = await api(URL_PROP, acao, corpo);
            avisar(j.msg);
            await carregar();
            return true;
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar.");
            if (m) avisar(m);
            return false;
        }
    };

    const abrirCadastro = async (p: Proposta) => {
        try {
            const j = await api(URL_PROP, "proposta", undefined, `&id=${p.id}`);
            setConferindo({ p, dados: j.dados.dados || {} });
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível abrir a proposta.");
            if (m) avisar(m);
        }
    };

    const plano = (id: number | null) => base?.planos.find((x) => x.id === id)?.nome || "—";
    const termo = busca.trim().toLowerCase();
    const bate = (...t: (string | null | undefined)[]) => !termo || t.some((x) => (x || "").toLowerCase().includes(termo) || (termo.replace(/\D/g, "").length >= 3 && (x || "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""))));
    const linhas = useMemo(
        () => (lista?.linhas || []).filter((p) => (!origem || p.origem === origem) && bate(p.nome, p.telefone, p.cpf, p.contrato_numero)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lista, origem, termo]
    );
    const fichas = useMemo(
        () => (aba === "abertas" && (!origem || origem === "aurora") ? (lista?.fichas || []).filter((f) => bate(f.nome, f.telefone)) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lista, origem, termo, aba]
    );
    const abertas = aba === "abertas" ? linhas : [];
    const atrasadas = abertas.filter((p) => p.atrasada).length;

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconClipboardPlus} titulo="Propostas de Adesão" />
                {erro ? <div className={ERRO}>{erro}</div> : null}
                {lista && !lista.contratos_no_conecta ? (
                    <div className="rounded-xl bg-[#FCF3CC] px-4 py-2.5 text-[14px] font-bold text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                        Até a virada, o contrato é lançado na Unymos: em &quot;Gerar contrato&quot;, informe o número de lá.
                    </div>
                ) : null}

                {conferindo && base ? (
                    <Novo
                        key={conferindo.p.id}
                        modo="conferir"
                        base={base}
                        recarregarBase={recarregar}
                        avisar={avisar}
                        url={URL_PROP}
                        salvarEm={{ url: URL_PROP, acao: "salvar", extra: { id: conferindo.p.id } }}
                        inicial={conferindo.dados}
                        rotuloSalvar={conferindo.p.etapa === "conferir" ? "Salvar e marcar como conferida" : "Salvar cadastro"}
                        cabecalho={
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" className={BTN_PEQ} onClick={() => setConferindo(null)}>
                                        ← Voltar às propostas
                                    </button>
                                    <b className="text-[16px]">
                                        Proposta #{conferindo.p.id} · {conferindo.p.origem_nome}
                                        {conferindo.p.vendedor ? ` · vendido por ${conferindo.p.vendedor}` : ""}
                                    </b>
                                </div>
                                {conferindo.dados.original ? (
                                    <div className={NOTA}>
                                        <span>
                                            <b>Como veio na ficha:</b>{" "}
                                            {Object.entries(conferindo.dados.original)
                                                .map(([k, v]) => `${k}: ${typeof v === "object" ? Object.values(v || {}).filter(Boolean).join(", ") : v ?? "—"}`)
                                                .join(" · ")}
                                            . O que não encaixou nas listas (bairro, parentesco, estado civil) precisa ser escolhido aqui.
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        }
                        onCriado={() => {
                            const p = conferindo.p;
                            setConferindo(null);
                            if (p.etapa === "conferir") void gravar("conferida", { id: p.id });
                            else void carregar();
                        }}
                    />
                ) : (
                    <>
                        <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-[#E3E8F0] dark:border-white/[0.12]">
                            {(
                                [
                                    ["abertas", "Em andamento"],
                                    ["gerada", "Contratos gerados"],
                                    ["desistiu", "Desistências"],
                                ] as [Aba, string][]
                            ).map(([k, n]) => (
                                <button
                                    key={k}
                                    type="button"
                                    role="tab"
                                    aria-selected={aba === k}
                                    onClick={() => {
                                        setLista(null);
                                        setAba(k);
                                    }}
                                    className={`min-h-11 px-3.5 text-[15px] font-extrabold ${aba === k ? "shadow-[inset_0_-3px_0_#F2CB3F]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Origem da venda">
                                {ORIGENS.map(([k, n]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        aria-pressed={origem === k}
                                        onClick={() => setOrigem(k)}
                                        className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[13.5px] font-extrabold ${
                                            origem === k ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]"
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <input className={`${CAMPO} !h-10 sm:ml-auto sm:max-w-[280px]`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, telefone, CPF ou contrato" aria-label="Buscar" />
                        </div>
                        {erroLista ? <div className={ERRO}>{erroLista}</div> : null}
                        {!lista || !base ? (
                            erroLista ? null : <div className={`${CARTAO} p-6 text-[#5B6478]`}>Carregando…</div>
                        ) : aba === "abertas" ? (
                            <div className={`${CARTAO} flex min-w-0 flex-col gap-3 p-3 sm:p-4`}>
                                {atrasadas ? (
                                    <div className={ERRO}>
                                        {atrasadas} proposta(s) parada(s) há mais de 1 dia útil na mesma etapa. Fim de semana e feriado não contam: o que entrou nesses dias precisa ser processado no dia útil seguinte.
                                    </div>
                                ) : null}
                                <div className={`grid gap-3 ${fichas.length ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                                    {fichas.length ? (
                                        <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-[#F6F8FB] p-2.5 dark:bg-[#1C2334]">
                                            <h3 className="flex items-center justify-between gap-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                                <span>Aguardando a ficha · WhatsApp</span>
                                                <span>{fichas.length}</span>
                                            </h3>
                                            {fichas.map((f) => (
                                                <div key={`f${f.id}`} className="flex flex-col gap-1 rounded-xl border border-[#E3E8F0] bg-white p-2.5 dark:border-white/[0.12] dark:bg-[#232B3F]">
                                                    <span className="flex items-start justify-between gap-2">
                                                        <b className="line-clamp-2 break-words text-[14.5px]">{f.nome || f.telefone || "Sem nome"}</b>
                                                        <span className={`${SELO} ${S_AB}`}>{f.plano}</span>
                                                    </span>
                                                    <span className={`${SELO} ${f.vencida ? S_RUIM : S_MUDO} self-start`}>{f.vencida ? "Link da ficha vencido" : "Cliente ainda não preencheu"}</span>
                                                    <span className={SUB}>
                                                        {f.mensalidade ? `${brl(f.mensalidade)}/mês` : "—"}
                                                        {f.adesao ? ` · adesão ${brl(f.adesao)}` : ""} · {quando(f.criado_em)}
                                                    </span>
                                                    {f.pessoas.length ? <span className={`${SUB} line-clamp-2 break-words`}>Citados na conversa: {f.pessoas.join(", ")}</span> : null}
                                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                                        {f.conversa_id ? (
                                                            <a className={BTN_PEQ} href={`/messenger?conversa=${f.conversa_id}`}>
                                                                Abrir conversa
                                                            </a>
                                                        ) : null}
                                                        <button type="button" className={BTN_PEQ} onClick={() => setFichaDesistindo(f)}>
                                                            Desistiu
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    {COLUNAS.map(([k, nome, botao]) => {
                                        const l = abertas.filter((p) => p.etapa === k);
                                        return (
                                            <div key={k} className="flex min-w-0 flex-col gap-2 rounded-2xl bg-[#F6F8FB] p-2.5 dark:bg-[#1C2334]">
                                                <h3 className="flex items-center justify-between gap-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                                    <span>{nome}</span>
                                                    <span>{l.length}</span>
                                                </h3>
                                                {!l.length ? <span className={`${SUB} px-1`}>Nenhuma proposta</span> : null}
                                                {l.map((p) => (
                                                    <div
                                                        key={p.id}
                                                        className={`flex flex-col gap-1 rounded-xl border bg-white p-2.5 dark:bg-[#232B3F] ${p.atrasada ? "border-[#B42318] border-l-4 dark:border-[#FF9C92]" : "border-[#E3E8F0] dark:border-white/[0.12]"}`}
                                                    >
                                                        <span className="flex items-start justify-between gap-2">
                                                            <b className="line-clamp-2 break-words text-[14.5px]">{p.nome}</b>
                                                            <span className={`${SELO} ${S_AB}`}>{plano(p.plano_id)}</span>
                                                        </span>
                                                        <span className={`${SELO} ${p.venda_direta ? S_OK : S_MUDO} self-start`}>{p.origem_nome}</span>
                                                        <span className={SUB}>
                                                            {p.beneficiarios ? `Titular + ${p.beneficiarios}` : "Titular"} · {brl(p.valor_mensal)}/mês · adesão {brl(p.valor_adesao)}
                                                        </span>
                                                        <span className={SUB}>
                                                            {p.vendedor ? `Vendido por ${p.vendedor}` : "Canal"} · {quando(p.criado_em)}
                                                        </span>
                                                        <span className={SUB}>{p.venda_direta ? `Comissão da adesão: ${p.vendedor || "vendedor"}` : "Canal: sem comissão de adesão"}</span>
                                                        {p.adesao_paga_em ? (
                                                            <span className={SUB}>
                                                                Adesão paga em {isoParaBR(p.adesao_paga_em)} · {lista.formas[p.adesao_forma || ""] || p.adesao_forma}
                                                                {p.adesao_no_ato ? " · no ato (vale)" : ""}
                                                            </span>
                                                        ) : null}
                                                        <span className={`${SUB} ${p.atrasada ? "!font-extrabold !text-[#B42318] dark:!text-[#FF9C92]" : ""}`}>Nesta etapa: {horasTexto(p.horas_uteis)}</span>
                                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                                            <button
                                                                type="button"
                                                                className={k === "paga" ? BTN_PEQ_PRI : BTN_PEQ}
                                                                onClick={() => (k === "conferir" ? void abrirCadastro(p) : k === "pagamento" ? setPagando(p) : setGerando(p))}
                                                            >
                                                                {botao}
                                                            </button>
                                                            {k !== "conferir" ? (
                                                                <button type="button" className={BTN_PEQ} onClick={() => void abrirCadastro(p)}>
                                                                    Cadastro
                                                                </button>
                                                            ) : null}
                                                            {k !== "conferir" ? (
                                                                <button type="button" className={BTN_PEQ} onClick={() => void gravar("voltar", { id: p.id })}>
                                                                    Voltar etapa
                                                                </button>
                                                            ) : null}
                                                            {p.planos_novos_id ? (
                                                                <button type="button" className={BTN_PEQ} onClick={() => setSiteAberto(p.planos_novos_id || null)}>
                                                                    Pedido do site
                                                                </button>
                                                            ) : null}
                                                            {p.conversa_id ? (
                                                                <a className={BTN_PEQ} href={`/messenger?conversa=${p.conversa_id}`}>
                                                                    Conversa
                                                                </a>
                                                            ) : null}
                                                            <button type="button" className={BTN_PEQ} onClick={() => setDesistindo(p)}>
                                                                Desistiu
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className={NOTA}>
                                    <span>
                                        <b>1. Para conferir:</b> abre o cadastro completo da venda (o mesmo do Novo contrato) para corrigir o que faltar. <b>2. Aguardando pagamento da adesão:</b> registre o
                                        pagamento; a venda do site já chega paga. <b>3. Adesão paga:</b> &quot;Gerar contrato&quot; dá o número; a carência conta do pagamento da adesão.
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className={`${CARTAO} min-w-0 overflow-x-auto p-1`}>
                                <table className="w-full min-w-[720px] text-left text-[14.5px]">
                                    <thead>
                                        <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                            <th className="px-3 py-2.5 font-extrabold">Data</th>
                                            <th className="px-3 py-2.5 font-extrabold">Cliente</th>
                                            <th className="px-3 py-2.5 font-extrabold">Plano</th>
                                            <th className="px-3 py-2.5 font-extrabold">Origem</th>
                                            <th className="px-3 py-2.5 font-extrabold">Vendedor</th>
                                            <th className="px-3 py-2.5 font-extrabold">{aba === "gerada" ? "Contrato" : "Motivo"}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!linhas.length ? (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-[#5B6478]">
                                                    Nada nos últimos 60 dias.
                                                </td>
                                            </tr>
                                        ) : (
                                            linhas.map((p) => (
                                                <tr key={p.id} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                                    <td className="px-3 py-2.5">{isoParaBR(p.etapa_em)}</td>
                                                    <td className="px-3 py-2.5 font-bold">
                                                        {p.planos_novos_id ? (
                                                            <button type="button" className="text-left font-bold underline decoration-dotted underline-offset-2" onClick={() => setSiteAberto(p.planos_novos_id || null)}>
                                                                {p.nome}
                                                            </button>
                                                        ) : (
                                                            p.nome
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5">{plano(p.plano_id)}</td>
                                                    <td className="px-3 py-2.5">{p.origem_nome}</td>
                                                    <td className="px-3 py-2.5">{p.vendedor || "Canal"}</td>
                                                    <td className="px-3 py-2.5">
                                                        {aba === "gerada" ? <span className={`${SELO} ${S_OK}`}>{p.contrato_numero}</span> : <span className={`${SELO} ${S_RUIM}`}>{p.motivo_desistencia || "—"}</span>}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {pagando && base && lista ? <JanelaPagamento p={pagando} hoje={base.hoje} formas={lista.formas} onFechar={() => setPagando(null)} gravar={gravar} /> : null}
            {gerando && lista ? <JanelaGerar p={gerando} lista={lista} onFechar={() => setGerando(null)} gravar={gravar} /> : null}
            {desistindo ? <JanelaDesistir p={desistindo} onFechar={() => setDesistindo(null)} gravar={gravar} /> : null}
            {fichaDesistindo ? <JanelaDesistirFicha f={fichaDesistindo} onFechar={() => setFichaDesistindo(null)} gravar={gravar} /> : null}
            {siteAberto ? (
                <PedidoSite
                    id={siteAberto}
                    onFechar={() => {
                        setSiteAberto(null);
                        const u = new URL(window.location.href);
                        if (u.searchParams.has("site")) {
                            u.searchParams.delete("site");
                            window.history.replaceState(null, "", u.toString());
                        }
                    }}
                    onMudou={() => void carregar()}
                />
            ) : null}
            {aviso}
        </div>
    );
}

type Gravar = (acao: string, corpo: Record<string, unknown>) => Promise<boolean>;

function Rodape({ onFechar, ok, rotulo, ocupado, bloqueado }: { onFechar: () => void; ok: () => void; rotulo: string; ocupado: boolean; bloqueado?: boolean }) {
    return (
        <>
            <button type="button" className={BTN_SEC} onClick={onFechar}>
                Voltar
            </button>
            <button type="button" className={BTN_PRI} disabled={ocupado || bloqueado} onClick={ok}>
                {ocupado ? "Salvando…" : rotulo}
            </button>
        </>
    );
}

function JanelaPagamento({ p, hoje, formas, onFechar, gravar }: { p: Proposta; hoje: string; formas: Record<string, string>; onFechar: () => void; gravar: Gravar }) {
    const [data, setData] = useState(isoParaBR(hoje));
    const [forma, setForma] = useState<string | null>(null);
    const [noAto, setNoAto] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const ok = async () => {
        const iso = dataValidar(data, hoje, false)[0];
        if (!iso || !forma) return;
        setOcupado(true);
        if (await gravar("pagamento", { id: p.id, data: iso, forma, no_ato: noAto })) onFechar();
        setOcupado(false);
    };
    return (
        <Janela titulo="Registrar pagamento da adesão" sub={`${p.nome} · adesão ${brl(p.valor_adesao)}`} onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={() => void ok()} rotulo="Registrar" ocupado={ocupado} bloqueado={!forma || !dataValidar(data, hoje, false)[0]} />}>
            <div className="grid gap-3 sm:grid-cols-2">
                <CampoData valor={data} onChange={setData} hoje={hoje} rotulo="Data do pagamento" rotuloCls={ROTULO} nascimento={false} />
                <div>
                    <span className={ROTULO}>Como foi pago</span>
                    <Combo rotulo="Como foi pago" opcoes={Object.entries(formas).filter(([v]) => v !== "site").map(([v, t]) => ({ v, t }))} valor={forma} onChange={setForma} />
                </div>
                {p.venda_direta ? (
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#E3E8F0] p-3 sm:col-span-2 dark:border-white/[0.12]">
                        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#313C55]" checked={noAto} onChange={(e) => setNoAto(e.target.checked)} />
                        <span className="text-[14.5px]">
                            <b>{p.vendedor || "O vendedor"} ficou com a adesão no ato</b>
                            <span className={`${SUB} block`}>Vira vale: a comissão já foi recebida e abate na folha.</span>
                        </span>
                    </label>
                ) : null}
            </div>
        </Janela>
    );
}

function JanelaGerar({ p, lista, onFechar, gravar }: { p: Proposta; lista: Lista; onFechar: () => void; gravar: Gravar }) {
    const [numero, setNumero] = useState("");
    const [teste, setTeste] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const precisaNumero = !lista.contratos_no_conecta && !teste;
    const ok = async () => {
        if (precisaNumero && !numero.trim()) return;
        setOcupado(true);
        if (await gravar("gerar", { id: p.id, numero: precisaNumero ? numero.trim() : null, teste })) onFechar();
        setOcupado(false);
    };
    return (
        <Janela
            titulo="Gerar contrato"
            sub={`${p.nome} · adesão paga em ${isoParaBR(p.adesao_paga_em)}`}
            onFechar={onFechar}
            rodape={<Rodape onFechar={onFechar} ok={() => void ok()} rotulo={precisaNumero ? "Registrar número" : "Gerar contrato"} ocupado={ocupado} bloqueado={precisaNumero && !numero.trim()} />}
        >
            <div className="flex flex-col gap-3">
                {lista.contratos_no_conecta ? (
                    <div className={NOTA}>O Conecta dá o próximo número e cria o contrato já Ativo; a carência conta do pagamento da adesão.</div>
                ) : (
                    <>
                        {!teste ? (
                            <label className="block">
                                <span className={ROTULO}>Número do contrato na Unymos</span>
                                <input className={CAMPO} inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Ex.: 016110" />
                                <span className={`${SUB} mt-1 block`}>Lance o contrato na Unymos e informe o número aqui: a proposta sai da fila e o card do funil vai para Fechado.</span>
                            </label>
                        ) : null}
                        {lista.pode_teste ? (
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
                                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#313C55]" checked={teste} onChange={(e) => setTeste(e.target.checked)} />
                                <span className="text-[14.5px]">
                                    <b>Gerar contrato de teste no Conecta (Gestão)</b>
                                    <span className={`${SUB} block`}>Número de teste (a partir de 900001). O funil e as filas antigas não mudam.</span>
                                </span>
                            </label>
                        ) : null}
                    </>
                )}
            </div>
        </Janela>
    );
}

function JanelaDesistir({ p, onFechar, gravar }: { p: Proposta; onFechar: () => void; gravar: Gravar }) {
    const [motivo, setMotivo] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const ok = async () => {
        if (!motivo.trim()) return;
        setOcupado(true);
        if (await gravar("desistir", { id: p.id, motivo: motivo.trim() })) onFechar();
        setOcupado(false);
    };
    return (
        <Janela titulo="Cliente desistiu" sub={p.nome} onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={() => void ok()} rotulo="Marcar desistência" ocupado={ocupado} bloqueado={!motivo.trim()} />}>
            <label className="block">
                <span className={ROTULO}>Motivo</span>
                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: não conseguiu pagar a adesão" />
                <span className={`${SUB} mt-1 block`}>
                    A proposta sai da fila; o card do funil vai para Perdido{p.planos_novos_id ? " e o cadastro do site é cancelado" : ""}.
                </span>
            </label>
        </Janela>
    );
}

function JanelaDesistirFicha({ f, onFechar, gravar }: { f: Ficha; onFechar: () => void; gravar: Gravar }) {
    const [motivo, setMotivo] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const ok = async () => {
        if (!motivo.trim()) return;
        setOcupado(true);
        if (await gravar("ficha_desistir", { id: f.id, motivo: motivo.trim() })) onFechar();
        setOcupado(false);
    };
    return (
        <Janela titulo="Cliente desistiu" sub={f.nome || f.telefone || "Venda do WhatsApp"} onFechar={onFechar} rodape={<Rodape onFechar={onFechar} ok={() => void ok()} rotulo="Marcar desistência" ocupado={ocupado} bloqueado={!motivo.trim()} />}>
            <label className="block">
                <span className={ROTULO}>Motivo</span>
                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: não respondeu mais" />
                <span className={`${SUB} mt-1 block`}>A venda sai da fila e o card do funil vai para Perdido.</span>
            </label>
        </Janela>
    );
}

/* ====================== Pedido do site (25/11/2026: veio da tela Novos planos, planos-novos.php) ======================
 * O número do contrato não é informado aqui: sai pelo "Gerar contrato" das Propostas, que também atualiza o cadastro do site. */

const PN_API = "https://api.planoassistencialintegrado.com.br/planos-novos.php";
const PN_LOGIN = "https://pai.planoassistencialintegrado.com.br/login";

async function pnJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = PN_LOGIN;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}

async function pnPost(corpo: Record<string, unknown>) {
    return pnJson(PN_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}

type PnStatus = "aguardando_pagamento" | "pago" | "contrato_criado" | "cancelado";

type PnLinha = {
    id: number;
    codigo: string;
    plano: string;
    status: PnStatus;
    titular_nome: string;
    titular_cpf: string;
    titular_celular: string;
    cidade: string | null;
    uf: string | null;
    qtd_dependentes: number;
    qtd_agregados: number;
    valor_adesao: number;
    valor_mensalidade: number;
    valor_pago: number | null;
    pago_em: string | null;
    wc_pedido_id: number | null;
    numero_contrato: string | null;
    criado_em: string;
};

type PnPessoa = {
    nome: string;
    cpf: string;
    nascimento: string;
    idade: number;
    parentesco: string;
    parentesco_rotulo: string;
    religiao: string;
    tipo: "dependente" | "agregado";
    paga: boolean;
};

type PnEvento = { em: string; tipo: string; por: string; [k: string]: unknown };

type PnCadastro = PnLinha & {
    titular_nascimento: string;
    titular_religiao: string;
    titular_email: string | null;
    endereco: { cep: string | null; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
    dependentes: PnPessoa[];
    qtd_agregados_pagos: number;
    valor_agregados: number;
    sucessor_nome: string | null;
    sucessor_cpf: string | null;
    aceite: { em: string; ip: string; versao: string; religiao: boolean };
    pagamento_metodo: string | null;
    carencia: { inicio: string; natural_ate: string; acidental_ate: string } | null;
    contrato_por: string | null;
    contrato_em: string | null;
    origem: string | null;
    observacao: string | null;
    eventos: PnEvento[];
};

const PN_STATUS: Record<PnStatus, { rotulo: string; classe: string; cor: string }> = {
    aguardando_pagamento: {
        rotulo: "Aguardando pagamento",
        classe: "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
        cor: "#3D6A99",
    },
    pago: {
        rotulo: "Adesão paga",
        classe: "border-[#E4BC30] bg-[#FCF3CC] text-[#313C55] dark:border-[#F2CB3F]/60 dark:bg-[#F2CB3F]/16 dark:text-white",
        cor: "#F2CB3F",
    },
    contrato_criado: {
        rotulo: "Contrato criado",
        classe: "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/18 dark:text-white",
        cor: "#B3CE52",
    },
    cancelado: {
        rotulo: "Cancelado",
        classe: "border-[#C9D1DE] bg-[#F1F4F8] text-[#5B6478] dark:border-white/20 dark:bg-white/8 dark:text-[#AEB9CF]",
        cor: "#7A8396",
    },
};

const PN_EVENTO: Record<string, string> = {
    cadastro: "Cadastro feito no site",
    pedido: "Pedido criado no WooCommerce",
    pago: "Pagamento confirmado",
    alerta: "Alerta",
    notificacao: "Notificação enviada",
    notificacao_falhou: "Notificação não enviada",
    cancelado: "Pedido cancelado/estornado",
    substituido: "Substituído por um cadastro novo",
    contrato: "Contrato informado",
    situacao: "Situação alterada",
    observacao: "Observação atualizada",
};

const pnBrl = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pnData = (s?: string | null, hora = false) => {
    if (!s) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}${hora && m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
};
const pnCpf = (c?: string | null) => (c && c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c || "—");
const pnTel = (t?: string | null) => {
    const d = (t || "").replace(/\D/g, "");
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return t || "—";
};
const pnWa = (t?: string | null, nome?: string) => {
    const d = (t || "").replace(/\D/g, "");
    const msg = `Olá, ${(nome || "").split(" ")[0]}! Aqui é do Plano PAI, sobre a sua adesão pelo site.`;
    return d ? `https://wa.me/55${d}?text=${encodeURIComponent(msg)}` : "";
};

function PnSelo({ status }: { status: PnStatus }) {
    const s = PN_STATUS[status];
    return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${s.classe}`}>{s.rotulo}</span>;
}

const PN_ROTULO = "text-[12px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const PN_CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[16px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white";
const PN_BTN =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#313C55] px-4 text-sm font-bold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const PN_BTN2 =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#C9D1DE] bg-[#FFFFFF] px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/26 dark:bg-transparent dark:text-white dark:hover:bg-white/8";

function PnLinha2({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E3E8F0] py-2 text-sm last:border-0 dark:border-white/12">
            <span className={PN_ROTULO}>{rotulo}</span>
            <span className="min-w-0 break-words">{children}</span>
        </div>
    );
}

function PedidoSite({ id, onFechar, onMudou }: { id: number; onFechar: () => void; onMudou: () => void }) {
    const [montado, setMontado] = useState(false);
    const [c, setC] = useState<PnCadastro | null>(null);
    const [erro, setErro] = useState("");
    const [ok, setOk] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [obs, setObs] = useState("");
    const [novaSituacao, setNovaSituacao] = useState<PnStatus | "">("");
    const [motivo, setMotivo] = useState("");

    useEffect(() => setMontado(true), []);
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);

    const carregar = useCallback(async () => {
        try {
            const j = await pnJson(`${PN_API}?acao=detalhar&id=${id}&_=${Date.now()}`);
            setC(j.cadastro);
            setObs(j.cadastro.observacao || "");
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao abrir.");
        }
    }, [id]);
    useEffect(() => { carregar(); }, [carregar]);

    const acao = async (corpo: Record<string, unknown>, msg: string) => {
        setSalvando(true); setErro(""); setOk("");
        try {
            const j = await pnPost({ ...corpo, id });
            setC(j.cadastro);
            setOk(msg);
            setNovaSituacao(""); setMotivo("");
            onMudou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const pessoas = useMemo(() => c?.dependentes || [], [c]);
    if (!montado) return null;

    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(49,60,85,0.45)] lg:items-center lg:p-6" onClick={onFechar}>
            <div
                className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#FFFFFF] text-[#313C55] lg:max-w-4xl lg:rounded-3xl dark:bg-[#232B3F] dark:text-white"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[#E3E8F0] px-5 py-4 dark:border-white/12">
                    <div>
                        <div className={PN_ROTULO}>Adesão {c?.codigo}</div>
                        <h2 className="text-xl font-extrabold">{c ? `${c.titular_nome} · Plano ${c.plano}` : "Carregando…"}</h2>
                        {c && <div className="mt-1"><PnSelo status={c.status} /></div>}
                    </div>
                    <button className="size-11 rounded-xl text-2xl hover:bg-[#EEF2F7] dark:hover:bg-white/8" onClick={onFechar} aria-label="Fechar">×</button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                    {erro && <div className="rounded-xl bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:bg-[#B42318]/20 dark:text-[#FF9C92]">{erro}</div>}
                    {ok && <div className="rounded-xl bg-[#EEF5D6] p-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/18 dark:text-white">{ok}</div>}
                    {c && (
                        <>
                            <section className="grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className={`${PN_ROTULO} mb-2`}>Plano e valores</h3>
                                    <PnLinha2 rotulo="Plano">{c.plano}</PnLinha2>
                                    <PnLinha2 rotulo="Mensalidade">{pnBrl(c.valor_mensalidade)}{c.valor_agregados > 0 ? ` (inclui ${pnBrl(c.valor_agregados)} de ${c.qtd_agregados_pagos} agregado${c.qtd_agregados_pagos > 1 ? "s" : ""})` : ""}</PnLinha2>
                                    <PnLinha2 rotulo="Adesão">{pnBrl(c.valor_adesao)}{c.valor_pago != null ? ` · pago ${pnBrl(c.valor_pago)}` : ""}</PnLinha2>
                                    <PnLinha2 rotulo="Pagamento">{c.pago_em ? `${pnData(c.pago_em, true)} · ${c.pagamento_metodo || ""}` : "Não confirmado"}{c.wc_pedido_id ? ` · pedido #${c.wc_pedido_id}` : ""}</PnLinha2>
                                    {/* 11/11/2026: comprovante (recibo) do pedido pago na Loja On-line, igual ao das coroas. */}
                                    {c.wc_pedido_id && c.pago_em && c.status !== "cancelado" ? (
                                        <div className="mb-2 mt-1">
                                            <BotoesReciboLoja pedidoLojaId={c.wc_pedido_id} somenteVer />
                                        </div>
                                    ) : null}
                                    <PnLinha2 rotulo="Carência">
                                        {c.carencia ? <>Desde {pnData(c.carencia.inicio, true)}<br />Natural até {pnData(c.carencia.natural_ate)} · acidente até {pnData(c.carencia.acidental_ate, true)}</> : "Começa no pagamento"}
                                    </PnLinha2>
                                    <PnLinha2 rotulo="Contrato">{c.numero_contrato ? `${c.numero_contrato} · ${c.contrato_por || ""} em ${pnData(c.contrato_em, true)}` : "—"}</PnLinha2>
                                </div>
                                <div>
                                    <h3 className={`${PN_ROTULO} mb-2`}>Titular</h3>
                                    <PnLinha2 rotulo="Nome">{c.titular_nome}</PnLinha2>
                                    <PnLinha2 rotulo="CPF">{pnCpf(c.titular_cpf)}</PnLinha2>
                                    <PnLinha2 rotulo="Nascimento">{pnData(c.titular_nascimento)}</PnLinha2>
                                    <PnLinha2 rotulo="Religião">{c.titular_religiao}</PnLinha2>
                                    <PnLinha2 rotulo="Celular">
                                        {pnTel(c.titular_celular)}{" "}
                                        {pnWa(c.titular_celular, c.titular_nome) && <a className="font-bold underline" href={pnWa(c.titular_celular, c.titular_nome)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                                    </PnLinha2>
                                    <PnLinha2 rotulo="E-mail">{c.titular_email || "—"}</PnLinha2>
                                    <PnLinha2 rotulo="Endereço">
                                        {c.endereco.logradouro}, {c.endereco.numero}{c.endereco.complemento ? ` · ${c.endereco.complemento}` : ""} · {c.endereco.bairro} · {c.endereco.cidade}-{c.endereco.uf}{c.endereco.cep ? ` · CEP ${c.endereco.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}` : ""}
                                    </PnLinha2>
                                    <PnLinha2 rotulo="Sucessor">{c.sucessor_nome ? `${c.sucessor_nome}${c.sucessor_cpf ? ` · ${pnCpf(c.sucessor_cpf)}` : ""}` : "Não indicado"}</PnLinha2>
                                </div>
                            </section>

                            <section>
                                <h3 className={`${PN_ROTULO} mb-2`}>Família ({pessoas.length})</h3>
                                {pessoas.length === 0 ? (
                                    <p className="text-sm text-[#7A8396]">Só o titular.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-[#E3E8F0] dark:border-white/12">
                                        <table className="w-full min-w-[640px] text-sm">
                                            <thead className="bg-[#F6F8FB] text-left dark:bg-[#1C2334]">
                                                <tr>{["Nome", "Parentesco", "Nascimento", "CPF", "Religião", "Entra como"].map((h) => <th key={h} className={`px-3 py-2 ${PN_ROTULO}`}>{h}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {pessoas.map((p, i) => (
                                                    <tr key={i} className="border-t border-[#E3E8F0] dark:border-white/12">
                                                        <td className="px-3 py-2">{p.nome || <span className="text-[#7A8396]">não informado</span>}</td>
                                                        <td className="px-3 py-2">{p.parentesco_rotulo}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">{pnData(p.nascimento)} · {p.idade} anos</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">{p.cpf ? pnCpf(p.cpf) : "—"}</td>
                                                        <td className="px-3 py-2">{p.religiao || "—"}</td>
                                                        <td className="px-3 py-2 font-bold">{c.plano === "FLEX" ? "Incluído" : p.tipo === "dependente" ? "Dependente" : p.paga ? "Agregado (pago)" : "Agregado (sem custo)"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            <section className="grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className={`${PN_ROTULO} mb-2`}>Observação da equipe</h3>
                                    <textarea className={`${PN_CAMPO} h-28 py-2`} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />
                                    <button className={`${PN_BTN2} mt-2`} disabled={salvando} onClick={() => acao({ acao: "observacao", texto: obs }, "Observação salva.")}>Salvar observação</button>
                                </div>
                                <div>
                                    <h3 className={`${PN_ROTULO} mb-2`}>Mudar situação</h3>
                                    <div className="space-y-2">
                                        <select className={PN_CAMPO} value={novaSituacao} onChange={(e) => setNovaSituacao(e.target.value as PnStatus | "")}>
                                            <option value="">Escolha</option>
                                            {(["aguardando_pagamento", "pago", "cancelado"] as PnStatus[]).filter((s) => s !== c.status).map((s) => (
                                                <option key={s} value={s}>{PN_STATUS[s].rotulo}</option>
                                            ))}
                                        </select>
                                        <input className={PN_CAMPO} placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
                                        <button className={PN_BTN2} disabled={salvando || !novaSituacao || !motivo.trim()} onClick={() => acao({ acao: "situacao", status: novaSituacao, motivo: motivo.trim() }, "Situação alterada.")}>
                                            Aplicar
                                        </button>
                                        <p className="text-xs text-[#7A8396]">Use só para corrigir: pagamento feito fora do site, desistência ou estorno.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className={`${PN_ROTULO} mb-2`}>Histórico</h3>
                                <ol className="space-y-1.5 text-sm">
                                    {[...c.eventos].reverse().map((e, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="w-32 shrink-0 text-[#7A8396]">{pnData(e.em, true)}</span>
                                            <span>
                                                <strong>{PN_EVENTO[e.tipo] || e.tipo}</strong>
                                                {e.por ? ` · ${e.por}` : ""}
                                                {typeof e.motivo === "string" && e.motivo ? ` · ${e.motivo}` : ""}
                                                {typeof e.msg === "string" ? ` · ${e.msg}` : ""}
                                                {typeof e.numero === "string" ? ` · ${e.numero}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                                <p className="mt-3 text-xs text-[#7A8396]">
                                    Aceite online em {pnData(c.aceite.em, true)} (versão {c.aceite.versao}){c.aceite.religiao ? " · autorizou o uso da religião" : ""}.{c.origem ? ` Origem: ${c.origem}` : ""}
                                </p>
                            </section>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/12 dark:bg-[#1C2334]">
                    <button className={PN_BTN2} onClick={onFechar}>Voltar</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
