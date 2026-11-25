"use client";

/**
 * Vendas (/comercial-vendas, chave comercial-vendas) — Comercial — ambiente de vendas, prévia aprovada em 19/11/2026 (versão 5).
 * Back-end: ct_vendas.php. Abas: Funil (oportunidades), Vender plano (o mesmo assistente do Novo contrato) e Minhas vendas.
 * Vender plano é de todos os colaboradores (menu com slugs ["*"]); a chave comercial-vendas libera ver as oportunidades de todos.
 * Dono da venda: quem chegou pelos canais (Aurora/WhatsApp, site) é do canal e a Administração fecha, sem comissão de adesão;
 * venda direta (o colaborador foi buscar o cliente) gera a comissão (100% da adesão) quando a adesão é paga.
 * A venda vai para as Propostas de Adesão (Administrativo), sem número; o contrato sai lá, com a adesão paga.
 *
 * 25/11/2026 (vendas unificadas no Comercial): o Funil antigo (/messenger-funil) saiu e redireciona para cá. Vieram dele:
 * busca e filtro por responsável, arrastar os cards entre Novo, Em conversa e Proposta enviada (no computador), o canal de
 * origem (aurora_10.php: canais; a Gestão troca no card com canal_salvar) e o link "Abrir conversa".
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";
import { IconChartFunnel } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import { api, BTN_PRI, BTN_SEC, CAMPO, CARTAO, ERRO, Janela, mensagemErro, NOTA, ROTULO, S_AB, S_AVISO, S_MUDO, S_OK, S_RUIM, SELO, SUB, useAviso } from "../contas-pagar/components/fin";
import { type Base, brl, CampoTel, Combo, isoParaBR, telMascara, telValidar, URL_VD, useBase } from "../contratos/components/ct";
import Novo, { type DadosVenda } from "../contratos/components/Novo";

type Aba = "funil" | "vender" | "minhas";
type Ver = "meus" | "canais" | "todos";

type BaseVd = Base & { pode: Base["pode"] & { todas: boolean; canais: boolean }; etapas: Record<string, string> };

type Card = {
    id: number;
    nome: string | null;
    telefone: string | null;
    cidade: string | null;
    plano: string | null;
    pessoas: number | null;
    interesse: string | null;
    origem: string | null;
    canal: string | null;
    etapa: string;
    etapa_em: string | null;
    motivo_perda: string | null;
    proximo_passo: string | null;
    proximo_contato: string | null;
    valor_mensal: number | null;
    notas: string | null;
    venda_direta: boolean;
    responsavel_id: number | null;
    responsavel: string | null;
    contrato: string | null;
    ct_proposta_id: number | null;
    conversa_id: number | null;
    criado_em: string | null;
};

type Hist = { texto: string; para: string | null; quem: string; em: string };

type Minha = {
    id: number;
    data: string;
    nome: string;
    plano: string | null;
    etapa: string;
    etapa_nome: string;
    contrato: string | null;
    valor_adesao: number;
    venda_direta: boolean;
    adesao_paga_em: string | null;
    no_ato: boolean;
    comissao: string;
};

const ETAPAS: [string, string][] = [
    ["novo", "Novo"],
    ["em_conversa", "Em conversa"],
    ["proposta", "Proposta enviada"],
    ["ficha", "Ficha preenchida"],
    ["fechado", "Fechado"],
    ["perdido", "Perdido"],
];
const PLANOS = ["LIGHT", "FLEX", "PLUS", "MAX"];
const ABERTAS = ["novo", "em_conversa", "proposta"];

const hojeBahia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const telDigitos = (t?: string | null) => (t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

function proximoTexto(c: Card, hoje: string) {
    if (c.etapa === "fechado") return c.contrato ? `Contrato ${c.contrato}` : "Fechado";
    if (c.etapa === "perdido") return c.motivo_perda || "Perdido";
    if (c.etapa === "ficha") return "Nas Propostas de Adesão";
    if (!c.proximo_contato) return "—";
    return c.proximo_contato === hoje ? "hoje" : c.proximo_contato < hoje ? `atrasado (${isoParaBR(c.proximo_contato).slice(0, 5)})` : isoParaBR(c.proximo_contato).slice(0, 5);
}

function SeloOrigem({ c, nomeCanal }: { c: Card; nomeCanal?: string }) {
    if (c.venda_direta) return <span className={`${SELO} ${S_OK} self-start`}>Venda direta</span>;
    const canal = nomeCanal || (c.canal === "site" ? "Site" : c.origem && !/^(whats|aurora)/i.test(c.origem) ? `WhatsApp · ${c.origem}` : "WhatsApp · Aurora");
    return <span className={`${SELO} ${S_AB} self-start`}>{canal}</span>;
}

/** 25/11/2026: canal de origem dos cards (aurora_10.php, o mesmo do Funil antigo e dos Resultados). Sem acesso, fica sem. */
const URL_CANAIS = `${API_BASE}/aurora_10.php`;
type Canais = { canais: Record<string, string | null>; nomes: Record<string, string> };

export default function Page() {
    const { base: b, erro, recarregar } = useBase(URL_VD);
    const base = b as BaseVd | null;
    const { avisar, aviso } = useAviso();
    const [aba, setAba] = useState<Aba>("funil");
    const [ver, setVer] = useState<Ver | null>(null);
    const [cards, setCards] = useState<Card[] | null>(null);
    const [erroFunil, setErroFunil] = useState("");
    const [aberto, setAberto] = useState<number | null>(null);
    const [nova, setNova] = useState(false);
    const [daOportunidade, setDaOportunidade] = useState<Card | null>(null);
    const [chaveVenda, setChaveVenda] = useState(0);
    const hoje = base?.hoje || hojeBahia();
    // 25/11/2026: vindos do Funil antigo
    const [busca, setBusca] = useState("");
    const [resp, setResp] = useState<string | null>(null);
    const [canais, setCanais] = useState<Canais>({ canais: {}, nomes: {} });
    const [arrastando, setArrastando] = useState<number | null>(null);
    const [sobre, setSobre] = useState<string | null>(null);
    const nomeCanal = (c: Card) => {
        const k = canais.canais[String(c.id)] || c.canal || "";
        return k ? canais.nomes[k] : undefined;
    };

    useEffect(() => {
        if (base && ver === null) setVer(base.pode.todas ? "todos" : "meus");
    }, [base, ver]);

    const carregar = useCallback(async () => {
        if (!ver) return;
        try {
            const j = await api(URL_VD, "funil", undefined, `&ver=${ver}`);
            setCards(j.dados || []);
            setErroFunil("");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível carregar o funil.");
            if (m) setErroFunil(m);
        }
        try {
            const j = await apiJson(`${URL_CANAIS}?action=canais&_=${Date.now()}`);
            setCanais({ canais: j.dados?.canais || {}, nomes: j.dados?.nomes || {} });
        } catch {
            /* sem acesso ao aurora_10.php: o card mostra a origem gravada */
        }
    }, [ver]);

    const salvarCanal = async (id: number, canal: string) => {
        try {
            const j = await apiJson(`${URL_CANAIS}?action=canal_salvar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, canal }) });
            setCanais((x) => ({ ...x, canais: { ...x.canais, [String(id)]: canal } }));
            avisar(j?.msg || "Canal salvo.");
        } catch (e: any) {
            avisar(e?.message || "Não foi possível salvar o canal.");
        }
    };

    // arrastar no computador: só entre as etapas abertas (Perdido pede o motivo, no card)
    const soltar = async (etapa: string) => {
        const id = arrastando;
        setArrastando(null);
        setSobre(null);
        const c = (cards || []).find((x) => x.id === id);
        if (!c || c.etapa === etapa || !ABERTAS.includes(etapa) || !ABERTAS.includes(c.etapa)) return;
        setCards((l) => (l || []).map((x) => (x.id === c.id ? { ...x, etapa } : x)));
        try {
            const j = await api(URL_VD, "mover", { id: c.id, etapa });
            avisar(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível mover.");
            if (m) avisar(m);
        }
        void carregar();
    };

    const responsaveis = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of cards || []) m.set(c.responsavel_id ? String(c.responsavel_id) : "sem", c.responsavel || (c.conversa_id ? "Aurora" : "Sem responsável"));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([v, t]) => ({ v, t }));
    }, [cards]);
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    const visiveis = (cards || []).filter(
        (c) =>
            (!resp || (c.responsavel_id ? String(c.responsavel_id) : "sem") === resp) &&
            (!termo ||
                [c.nome, c.cidade, c.plano, c.notas, c.interesse].some((x) => (x || "").toLowerCase().includes(termo)) ||
                (digitos.length >= 3 && (c.telefone || "").replace(/\D/g, "").includes(digitos)))
    );

    useEffect(() => {
        if (aba === "funil") void carregar();
    }, [aba, carregar]);

    const venderDe = (c: Card | null) => {
        setDaOportunidade(c);
        setChaveVenda((k) => k + 1);
        setAberto(null);
        setAba("vender");
    };

    const inicialVenda = useMemo<DadosVenda | null>(() => {
        if (!daOportunidade || !base) return null;
        const plano = base.planos.find((p) => p.situacao === "vende" && p.pronto && p.nome.toUpperCase() === (daOportunidade.plano || "").toUpperCase());
        return { titular: { nome: daOportunidade.nome || "", telefone1: telDigitos(daOportunidade.telefone), aceite_whatsapp: true }, plano_id: plano?.id ?? null };
    }, [daOportunidade, base]);

    const verOpcoes: [Ver, string][] = base
        ? [
              ...(base.pode.todas ? ([["todos", "Todos"]] as [Ver, string][]) : []),
              ["meus", "Minhas oportunidades"],
              ...(base.pode.canais ? ([["canais", "Canais · Administração"]] as [Ver, string][]) : []),
          ]
        : [];

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconChartFunnel}
                    titulo="Vendas"
                    acoes={
                        <button type="button" className={BTN_PRI} onClick={() => venderDe(null)}>
                            + Vender plano
                        </button>
                    }
                />
                {erro ? <div className={ERRO}>{erro}</div> : null}
                <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-[#E3E8F0] dark:border-white/[0.12]">
                    {(
                        [
                            ["funil", "Funil"],
                            ["vender", "Vender plano"],
                            ["minhas", "Minhas vendas"],
                        ] as [Aba, string][]
                    ).map(([k, n]) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={aba === k}
                            onClick={() => (k === "vender" ? venderDe(null) : setAba(k))}
                            className={`min-h-11 px-3.5 text-[15px] font-extrabold ${aba === k ? "shadow-[inset_0_-3px_0_#F2CB3F]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>

                {!base ? (
                    erro ? null : <div className={`${CARTAO} p-6 text-[#5B6478]`}>Carregando…</div>
                ) : aba === "funil" ? (
                    <div className={`${CARTAO} flex min-w-0 flex-col gap-3 p-3 sm:p-4`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div role="tablist" className="flex flex-wrap gap-1.5">
                                {verOpcoes.map(([k, n]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        role="tab"
                                        aria-selected={ver === k}
                                        onClick={() => {
                                            setCards(null);
                                            setVer(k);
                                        }}
                                        className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[13.5px] font-extrabold ${
                                            ver === k ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]"
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <button type="button" className={BTN_SEC} onClick={() => setNova(true)}>
                                + Nova oportunidade
                            </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_260px]">
                            <input className={`${CAMPO} !h-11`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, telefone, cidade ou anotação" aria-label="Buscar no funil" />
                            <Combo rotulo="Responsável" vazio="Todos os responsáveis" opcoes={responsaveis} valor={resp} onChange={setResp} />
                        </div>
                        {erroFunil ? <div className={ERRO}>{erroFunil}</div> : null}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(200px,1fr))] lg:overflow-x-auto">
                            {ETAPAS.map(([k, nome]) => {
                                const l = visiveis.filter((c) => c.etapa === k);
                                const alvo = arrastando !== null && ABERTAS.includes(k);
                                return (
                                    <div
                                        key={k}
                                        onDragOver={(e) => {
                                            if (!alvo) return;
                                            e.preventDefault();
                                            if (sobre !== k) setSobre(k);
                                        }}
                                        onDragLeave={() => sobre === k && setSobre(null)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            void soltar(k);
                                        }}
                                        className={`flex min-w-0 flex-col gap-2 rounded-2xl bg-[#F6F8FB] p-2.5 dark:bg-[#1C2334] ${alvo && sobre === k ? "ring-2 ring-[#3D6A99]" : ""}`}
                                    >
                                        <h3 className="flex items-center justify-between px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                            <span>{nome}</span>
                                            <span>{cards ? l.length : ""}</span>
                                        </h3>
                                        {cards === null ? (
                                            <span className={`${SUB} px-1`}>Carregando…</span>
                                        ) : !l.length ? (
                                            <span className={`${SUB} px-1`}>Nenhum card</span>
                                        ) : (
                                            l.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    draggable={ABERTAS.includes(c.etapa)}
                                                    onDragStart={() => setArrastando(c.id)}
                                                    onDragEnd={() => {
                                                        setArrastando(null);
                                                        setSobre(null);
                                                    }}
                                                    onClick={() => setAberto(c.id)}
                                                    className="flex flex-col gap-1 rounded-xl border border-[#E3E8F0] bg-white p-2.5 text-left hover:border-[#3D6A99] dark:border-white/[0.12] dark:bg-[#232B3F]"
                                                >
                                                    <span className="flex items-start justify-between gap-2">
                                                        <b className="line-clamp-2 break-words text-[14.5px]">{c.nome || "Sem nome"}</b>
                                                        {c.plano ? <span className={`${SELO} ${S_AB}`}>{c.plano}</span> : null}
                                                    </span>
                                                    <SeloOrigem c={c} nomeCanal={nomeCanal(c)} />
                                                    <span className={SUB}>
                                                        {c.responsavel || (c.conversa_id ? "Aurora" : "Sem responsável")}
                                                        {c.valor_mensal ? ` · ${brl(c.valor_mensal)}/mês` : ""}
                                                    </span>
                                                    <span className={`${SUB} ${c.proximo_contato && c.proximo_contato < hoje && ABERTAS.includes(c.etapa) ? "!font-extrabold !text-[#B42318] dark:!text-[#FF9C92]" : ""}`}>
                                                        Próximo: {proximoTexto(c, hoje)}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className={NOTA}>
                            <span>
                                <b>Oportunidade</b> é todo interesse antes de virar venda. As conversas em que a Aurora viu interesse continuam entrando sozinhas. Fechou? No card, <b>Vender plano</b> abre o
                                cadastro completo; a venda vai para as Propostas de Adesão e o card anda sozinho para &quot;Ficha preenchida&quot; e, com o contrato gerado, para &quot;Fechado&quot;.
                            </span>
                        </div>
                        <div className={NOTA}>
                            <span>
                                <b>Canais</b> (WhatsApp, Aurora, site): o cliente procurou o PAI e a Administração fecha; <b>não gera comissão de adesão</b>. <b>Venda direta</b>: você foi buscar o cliente
                                (oportunidade criada por você ou venda feita direto no Vender plano): a comissão da adesão é sua.
                            </span>
                        </div>
                    </div>
                ) : aba === "vender" ? (
                    <Novo
                        key={chaveVenda}
                        modo="vendas"
                        base={base}
                        recarregarBase={recarregar}
                        avisar={avisar}
                        url={URL_VD}
                        salvarEm={{ url: URL_VD, acao: "enviar", extra: daOportunidade ? { funil_id: daOportunidade.id } : {} }}
                        inicial={inicialVenda}
                        rotuloSalvar="Enviar para Propostas de Adesão"
                        cabecalho={
                            daOportunidade ? (
                                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#E9EFF6] px-3.5 py-2.5 text-[14px] dark:bg-[#3D6A99]/25">
                                    <span>
                                        Venda da oportunidade <b>{daOportunidade.nome}</b> ·{" "}
                                        {daOportunidade.venda_direta ? "venda direta (comissão de quem buscou o cliente)" : "canal (sem comissão de adesão)"}
                                    </span>
                                </div>
                            ) : (
                                <div className="rounded-xl bg-[#E9EFF6] px-3.5 py-2.5 text-[14px] dark:bg-[#3D6A99]/25">Venda direta: você fica como vendedor e recebe a adesão quando ela for paga.</div>
                            )
                        }
                        onCriado={() => {
                            setDaOportunidade(null);
                            setAba(daOportunidade ? "funil" : "minhas");
                        }}
                    />
                ) : (
                    <MinhasVendas base={base} />
                )}
            </div>

            {aberto && base ? (
                <JanelaCard
                    id={aberto}
                    base={base}
                    avisar={avisar}
                    onFechar={() => setAberto(null)}
                    onMudou={() => void carregar()}
                    onVender={venderDe}
                    canais={canais}
                    salvarCanal={salvarCanal}
                />
            ) : null}
            {nova && base ? (
                <JanelaOportunidade
                    base={base}
                    avisar={avisar}
                    onFechar={() => setNova(false)}
                    onSalvo={() => {
                        setNova(false);
                        if (ver !== "meus" && !base.pode.todas) setVer("meus");
                        void carregar();
                    }}
                />
            ) : null}
            {aviso}
        </div>
    );
}

/* ============================== oportunidade ============================== */

type FormOp = { nome: string; telefone: string; cidade: string; plano: string | null; proximo_contato: string; proximo_passo: string; notas: string };

function formDe(c?: Card | null): FormOp {
    return {
        nome: c?.nome || "",
        telefone: c ? telMascara(telDigitos(c.telefone)) : "",
        cidade: c?.cidade || "",
        plano: c?.plano || null,
        proximo_contato: c?.proximo_contato || "",
        proximo_passo: c?.proximo_passo || "",
        notas: c?.notas || "",
    };
}

function CamposOportunidade({ f, set, travado }: { f: FormOp; set: (p: Partial<FormOp>) => void; travado?: boolean }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
                <span className={ROTULO}>Nome do cliente</span>
                <input className={CAMPO} value={f.nome} disabled={travado} onChange={(e) => set({ nome: e.target.value })} />
            </label>
            {travado ? (
                <label className="block">
                    <span className={ROTULO}>Celular</span>
                    <input className={CAMPO} value={f.telefone} disabled />
                </label>
            ) : (
                <CampoTel valor={f.telefone} onChange={(v) => set({ telefone: v })} rotulo="Celular" rotuloCls={ROTULO} dica="DDD + número." />
            )}
            <label className="block">
                <span className={ROTULO}>Cidade</span>
                <input className={CAMPO} value={f.cidade} disabled={travado} onChange={(e) => set({ cidade: e.target.value })} />
            </label>
            <div>
                <span className={ROTULO}>Plano de interesse</span>
                <Combo rotulo="Plano de interesse" vazio="Ainda não sabe" opcoes={PLANOS.map((p) => ({ v: p, t: p }))} valor={f.plano} onChange={(v) => set({ plano: v })} desativado={travado} />
            </div>
            <label className="block">
                <span className={ROTULO}>Próximo contato</span>
                <input type="date" className={CAMPO} value={f.proximo_contato} disabled={travado} onChange={(e) => set({ proximo_contato: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className={ROTULO}>Próximo passo</span>
                <input className={CAMPO} value={f.proximo_passo} disabled={travado} placeholder="Ex.: ligar para apresentar o PLUS" onChange={(e) => set({ proximo_passo: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className={ROTULO}>Anotações</span>
                <textarea className={`${CAMPO} !h-24 py-2.5`} value={f.notas} disabled={travado} onChange={(e) => set({ notas: e.target.value })} />
            </label>
        </div>
    );
}

function corpoOp(f: FormOp) {
    return {
        nome: f.nome.trim(),
        telefone: f.telefone,
        cidade: f.cidade.trim(),
        plano: f.plano,
        proximo_contato: f.proximo_contato,
        proximo_passo: f.proximo_passo.trim(),
        notas: f.notas.trim(),
    };
}

function JanelaOportunidade({ base, avisar, onFechar, onSalvo }: { base: BaseVd; avisar: (m: string) => void; onFechar: () => void; onSalvo: () => void }) {
    const [f, setF] = useState<FormOp>(formDe(null));
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
        if (!f.nome.trim()) return avisar("Informe o nome do cliente.");
        if (telValidar(f.telefone)[0] !== true) return avisar("Informe um celular válido, com DDD.");
        setSalvando(true);
        try {
            const j = await api(URL_VD, "oportunidade", corpoOp(f));
            avisar(j.msg);
            onSalvo();
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar.");
            if (m) avisar(m);
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo="Nova oportunidade"
            sub={`Venda direta: fica com você (${base.colaboradores.find((u) => u.id === base.eu_id)?.nome || "você"}) e a comissão da adesão é sua quando fechar.`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                        {salvando ? "Salvando…" : "Criar oportunidade"}
                    </button>
                </>
            }
        >
            <CamposOportunidade f={f} set={(p) => setF((x) => ({ ...x, ...p }))} />
        </Janela>
    );
}

function JanelaCard({
    id,
    base,
    avisar,
    onFechar,
    onMudou,
    onVender,
    canais,
    salvarCanal,
}: {
    id: number;
    base: BaseVd;
    avisar: (m: string) => void;
    onFechar: () => void;
    onMudou: () => void;
    onVender: (c: Card) => void;
    canais: Canais;
    salvarCanal: (id: number, canal: string) => Promise<void>;
}) {
    const [c, setC] = useState<Card | null>(null);
    const [hist, setHist] = useState<Hist[]>([]);
    const [f, setF] = useState<FormOp>(formDe(null));
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [etapa, setEtapa] = useState<string | null>(null);
    const [motivo, setMotivo] = useState("");

    const ler = useCallback(async () => {
        try {
            const j = await api(URL_VD, "card", undefined, `&id=${id}`);
            setC(j.dados.card);
            setHist(j.dados.historico || []);
            setF(formDe(j.dados.card));
            setEtapa(j.dados.card.etapa);
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível abrir a oportunidade.");
            if (m) setErro(m);
        }
    }, [id]);
    useEffect(() => {
        void ler();
    }, [ler]);

    const aberta = !!c && ABERTAS.includes(c.etapa);
    const trocaResp = !!c && (base.pode.todas || (!c.venda_direta && base.pode.canais));

    const gravar = async (acao: string, corpo: Record<string, unknown>) => {
        setSalvando(true);
        try {
            const j = await api(URL_VD, acao, corpo);
            avisar(j.msg);
            onMudou();
            await ler();
            return true;
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível salvar.");
            if (m) avisar(m);
            return false;
        } finally {
            setSalvando(false);
        }
    };

    const salvar = async () => {
        if (!c) return;
        if (telValidar(f.telefone)[0] !== true) return avisar("Informe um celular válido, com DDD.");
        if (etapa && etapa !== c.etapa) {
            if (etapa === "perdido" && !motivo.trim()) return avisar("Informe por que a venda foi perdida.");
            if (!(await gravar("mover", { id: c.id, etapa, motivo: motivo.trim() }))) return;
        }
        if (await gravar("oportunidade", { id: c.id, ...corpoOp(f) })) onFechar();
    };

    return (
        <Janela
            titulo={c?.nome || "Oportunidade"}
            sub={c ? `${base.etapas[c.etapa] || c.etapa} · ${c.venda_direta ? "Venda direta" : "Canal (sem comissão de adesão)"} · ${c.responsavel || "Sem responsável"}` : undefined}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    {aberta ? (
                        <>
                            <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => void salvar()}>
                                {salvando ? "Salvando…" : "Salvar"}
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => c && onVender(c)}>
                                Vender plano
                            </button>
                        </>
                    ) : null}
                </>
            }
        >
            {erro ? <div className={ERRO}>{erro}</div> : !c ? <span className={SUB}>Carregando…</span> : (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                        <SeloOrigem c={c} nomeCanal={(() => {
                            const k = canais.canais[String(c.id)] || c.canal || "";
                            return k ? canais.nomes[k] : undefined;
                        })()} />
                        {c.conversa_id ? (
                            <a className={`${SELO} ${S_MUDO} underline`} href={`/messenger?conversa=${c.conversa_id}`}>
                                Abrir conversa
                            </a>
                        ) : null}
                        {c.interesse ? <span className={`${SELO} ${S_MUDO}`}>Interesse: {c.interesse}</span> : null}
                        {c.pessoas ? <span className={`${SELO} ${S_MUDO}`}>{c.pessoas} pessoa(s)</span> : null}
                        {c.ct_proposta_id ? <span className={`${SELO} ${S_AVISO}`}>Proposta #{c.ct_proposta_id}</span> : null}
                        {c.contrato ? <span className={`${SELO} ${S_OK}`}>Contrato {c.contrato}</span> : null}
                    </div>
                    <CamposOportunidade f={f} set={(p) => setF((x) => ({ ...x, ...p }))} travado={!aberta} />
                    {base.pode.gestao && !c.venda_direta && Object.keys(canais.nomes).length ? (
                        <div>
                            <span className={ROTULO}>Canal de origem (Gestão)</span>
                            <Combo
                                rotulo="Canal de origem"
                                opcoes={Object.entries(canais.nomes).map(([v, t]) => ({ v, t }))}
                                valor={canais.canais[String(c.id)] || c.canal || null}
                                onChange={(v) => v && void salvarCanal(c.id, v)}
                            />
                        </div>
                    ) : null}
                    {aberta ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <span className={ROTULO}>Etapa</span>
                                <Combo
                                    rotulo="Etapa"
                                    opcoes={ETAPAS.filter(([k]) => ABERTAS.includes(k) || k === "perdido").map(([v, t]) => ({ v, t }))}
                                    valor={etapa}
                                    onChange={(v) => setEtapa(v)}
                                />
                            </div>
                            {etapa === "perdido" ? (
                                <label className="block">
                                    <span className={ROTULO}>Motivo da perda</span>
                                    <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: achou caro" />
                                </label>
                            ) : null}
                        </div>
                    ) : null}
                    {trocaResp ? (
                        <div>
                            <span className={ROTULO}>Responsável</span>
                            <Combo
                                rotulo="Responsável"
                                vazio={c.venda_direta ? undefined : "Administração"}
                                opcoes={base.colaboradores.map((u) => ({ v: u.id, t: u.nome }))}
                                valor={c.responsavel_id}
                                onChange={(v) => void gravar("responsavel", { id: c.id, usuario_id: v })}
                            />
                            <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                {c.venda_direta ? "Venda direta: a comissão é de quem foi buscar o cliente." : "Card de canal continua de canal: trocar o responsável não gera comissão de adesão."}
                            </span>
                        </div>
                    ) : null}
                    {c.etapa === "ficha" ? <div className={NOTA}>A venda está nas Propostas de Adesão. O card vai para &quot;Fechado&quot; quando o contrato for gerado.</div> : null}
                    <div>
                        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">Histórico</h3>
                        {hist.length ? (
                            <ul className="flex flex-col gap-1.5">
                                {hist.map((h, i) => (
                                    <li key={i} className="rounded-xl bg-[#F6F8FB] px-3 py-2 text-[14px] dark:bg-[#1C2334]">
                                        <span className="break-words">{h.texto}</span>
                                        <span className={`${SUB} block`}>
                                            {h.quem} · {isoParaBR(h.em)} {h.em?.slice(11, 16)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <span className={SUB}>Sem registros.</span>
                        )}
                    </div>
                </div>
            )}
        </Janela>
    );
}

/* ============================== minhas vendas ============================== */

function MinhasVendas({ base }: { base: BaseVd }) {
    const meses = useMemo(() => {
        const [y, m] = base.hoje.split("-").map(Number);
        return Array.from({ length: 12 }, (_, i) => {
            const t = y * 12 + (m - 1) - i;
            const ym = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
            return { v: ym, t: `${ym.slice(5)}/${ym.slice(0, 4)}` };
        });
    }, [base.hoje]);
    const [mes, setMes] = useState<string>(meses[0].v);
    const [quem, setQuem] = useState<number | null>(null);
    const [d, setD] = useState<{ resumo: { vendas: number; pagas: number; comissao: number; no_ato: number }; linhas: Minha[] } | null>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        let vivo = true;
        setD(null);
        (async () => {
            try {
                const j = await api(URL_VD, "minhas", undefined, `&mes=${mes}${quem ? `&usuario_id=${quem}` : ""}`);
                if (vivo) {
                    setD(j.dados);
                    setErro("");
                }
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível carregar as vendas.");
                if (vivo && m) setErro(m);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [mes, quem]);

    const selo = (l: Minha) => (l.etapa === "gerada" ? S_OK : l.etapa === "desistiu" ? S_RUIM : l.etapa === "paga" ? S_OK : S_AB);

    return (
        <div className={`${CARTAO} flex min-w-0 flex-col gap-3 p-3 sm:p-4`}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <span className={ROTULO}>Mês</span>
                    <Combo rotulo="Mês" opcoes={meses} valor={mes} onChange={(v) => setMes(v || meses[0].v)} />
                </div>
                {base.pode.todas ? (
                    <div>
                        <span className={ROTULO}>Colaborador</span>
                        <Combo rotulo="Colaborador" vazio="Eu" opcoes={base.colaboradores.map((u) => ({ v: u.id, t: u.nome }))} valor={quem} onChange={setQuem} />
                    </div>
                ) : null}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {(
                    [
                        ["Vendas no mês", d ? String(d.resumo.vendas) : "…"],
                        ["Adesões pagas", d ? String(d.resumo.pagas) : "…"],
                        ["Comissão a receber", d ? brl(d.resumo.comissao) : "…"],
                        ["Já recebido no ato (vale)", d ? brl(d.resumo.no_ato) : "…"],
                    ] as [string, string][]
                ).map(([r, v]) => (
                    <div key={r} className="rounded-2xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                        <span className={SUB}>{r}</span>
                        <b className="block text-[22px]">{v}</b>
                    </div>
                ))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[14.5px]">
                    <thead>
                        <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                            <th className="px-2 py-2 font-extrabold">Data</th>
                            <th className="px-2 py-2 font-extrabold">Cliente</th>
                            <th className="px-2 py-2 font-extrabold">Plano</th>
                            <th className="px-2 py-2 font-extrabold">Situação</th>
                            <th className="px-2 py-2 text-right font-extrabold">Adesão</th>
                            <th className="px-2 py-2 font-extrabold">Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!d ? (
                            <tr>
                                <td colSpan={6} className="px-2 py-5 text-center text-[#5B6478]">
                                    Carregando…
                                </td>
                            </tr>
                        ) : !d.linhas.length ? (
                            <tr>
                                <td colSpan={6} className="px-2 py-5 text-center text-[#5B6478]">
                                    Nenhuma venda neste mês.
                                </td>
                            </tr>
                        ) : (
                            d.linhas.map((l) => (
                                <tr key={l.id} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                    <td className="px-2 py-2.5">{isoParaBR(l.data)}</td>
                                    <td className="px-2 py-2.5 font-bold">{l.nome}</td>
                                    <td className="px-2 py-2.5">{l.plano || "—"}</td>
                                    <td className="px-2 py-2.5">
                                        <span className={`${SELO} ${selo(l)}`}>{l.etapa === "gerada" && l.contrato ? `Contrato ${l.contrato}` : l.etapa_nome}</span>
                                    </td>
                                    <td className="px-2 py-2.5 text-right">{brl(l.valor_adesao)}</td>
                                    <td className="px-2 py-2.5">{l.comissao}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className={NOTA}>
                <span>Cada colaborador vê só as próprias vendas, com a situação nas Propostas de Adesão. A comissão é a adesão (100%) da venda direta, quando a adesão é paga; venda de canal não gera comissão.</span>
            </div>
        </div>
    );
}
