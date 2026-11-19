"use client";

/**
 * Propostas de Adesão (/propostas-adesao, chave propostas-adesao) — Administrativo — ambiente de vendas, prévia aprovada em 19/11/2026 (versão 5).
 * Back-end: ct_propostas.php. Sala de espera dos contratos novos: chega a venda já feita (Vender plano, Novo contrato,
 * ficha do WhatsApp e do site). 1. Para conferir → 2. Aguardando pagamento da adesão → 3. Adesão paga · gerar contrato.
 * O número do contrato só sai com a adesão paga. Até a virada, o número vem da Unymos (lançar lá e informar aqui);
 * a Gestão pode gerar um contrato de teste no Conecta.
 * Prazo: parada na mesma etapa por mais de 24 horas úteis fica em vermelho (sábado, domingo e feriados não contam: nacionais, 2 de Julho e os de Barreiras).
 */
import React, { useCallback, useEffect, useState } from "react";
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
};

type Lista = { linhas: Proposta[]; contratos_no_conecta: boolean; pode_teste: boolean; formas: Record<string, string> };

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
    const abertas = aba === "abertas" ? lista?.linhas || [] : [];
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
                                <div className="grid gap-3 lg:grid-cols-3">
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
                                        {!lista.linhas.length ? (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-[#5B6478]">
                                                    Nada nos últimos 60 dias.
                                                </td>
                                            </tr>
                                        ) : (
                                            lista.linhas.map((p) => (
                                                <tr key={p.id} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                                    <td className="px-3 py-2.5">{isoParaBR(p.etapa_em)}</td>
                                                    <td className="px-3 py-2.5 font-bold">{p.nome}</td>
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
                <span className={`${SUB} mt-1 block`}>A proposta sai da fila; o card do funil vai para Perdido.</span>
            </label>
        </Janela>
    );
}
