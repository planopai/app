"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ItensOSAjuste from "../components/ItensOSAjuste";
import {
    BarraFiltrosOS, CartoesOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, filtroInicial, itensExportar, paramsDoFiltro, situacaoDaOS, useOpcoesAgente,
    type FiltroOS, type TabelaExport,
} from "../components/ListaOS";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) {
        const err: any = new Error(json?.msg || `Falha na requisição (${res.status}).`);
        err.status = res.status;
        throw err;
    }
    return json;
}

function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    });
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}

function osPost(acao: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) body.set(k, String(v));
    });
    return apiJson(OS_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
}

const brl = (v: any) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

const dataBR = (s?: string | null) =>
    s ? new Date(s.replace(" ", "T")).toLocaleDateString("pt-BR") : "—";

const dataHoraBR = (s?: string | null) =>
    s
        ? new Date(s.replace(" ", "T")).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        })
        : "—";

const hoje = () => new Date().toLocaleDateString("sv-SE");
const inicioMes = () => hoje().slice(0, 8) + "01";

const COR = {
    navy: "#313C55",
    amarelo: "#F2CB3F",
    verde: "#B3CE52",
    azul: "#00AEEC",
    muted: "#6B7488",
};

function Kpi({
    rotulo,
    valor,
    sub,
    cor,
}: {
    rotulo: string;
    valor: string;
    sub?: string;
    cor: string;
}) {
    return (
        <div
            className="flex-1 rounded-xl border border-[#E1E5EC] bg-white p-4"
            style={{ borderTop: `4px solid ${cor}` }}
        >
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">
                {rotulo}
            </div>
            <div className="mt-1 whitespace-nowrap text-2xl font-extrabold text-[#313C55]">
                {valor}
            </div>
            {sub && <div className="text-xs text-[#6B7488]">{sub}</div>}
        </div>
    );
}

function Tag({
    children,
    tom = "neutro",
}: {
    children: React.ReactNode;
    tom?: "amarelo" | "verde" | "azul" | "laranja" | "neutro";
}) {
    const bg = {
        amarelo: "#FBEFC4",
        verde: "#E6F0C9",
        azul: "#E0F3FA",
        laranja: "#FDECD8",
        neutro: "#EEF1F5",
    }[tom];

    return (
        <span
            className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-[#313C55]"
            style={{ background: bg }}
        >
            {children}
        </span>
    );
}

function Botao({
    children,
    primario,
    perigo,
    ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    primario?: boolean;
    perigo?: boolean;
}) {
    const cls = perigo
        ? "bg-[#C0392B] text-white"
        : primario
            ? "bg-[#313C55] text-white"
            : "border border-[#E1E5EC] bg-white text-[#313C55]";

    return (
        <button
            type="button"
            {...p}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${cls} ${p.className || ""}`}
        >
            {children}
        </button>
    );
}

function Campo({
    rotulo,
    children,
}: {
    rotulo: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">
                {rotulo}
            </span>
            {children}
        </label>
    );
}

const inputCls =
    "w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC]";

const TIPOS = [
    { v: "", r: "Todos" },
    { v: "PRT", r: "Particular (Prt)" },
    { v: "SOC", r: "Associado (Soc)" },
    { v: "DIF_SOC", r: "Dif.Soc" },
    { v: "PRF", r: "Prefeitura (Prf)" },
    { v: "DIF_PRF", r: "Dif.Prf" },
    { v: "COR", r: "Coroa (Cor)" },
];

const FORMAS = [
    "PIX",
    "DINHEIRO",
    "CARTAO_DEBITO",
    "CARTAO_CREDITO",
    "TRANSFERENCIA",
    "CHEQUE",
    "BOLETO",
    "OUTRO",
];

function tagNP(np: any) {
    if (!np) return <span className="text-[#6B7488]">—</span>;
    if (np.status === "BAIXADA") {
        return (
            <Tag tom="verde">
                NP BAIXADA{np.devolvida ? " · DEVOLVIDA" : ""}
            </Tag>
        );
    }
    if (np.status === "SUBSTITUIDA") {
        return (
            <Tag tom="amarelo">
                NP SUBSTITUÍDA{np.devolvida ? " · DEVOLVIDA" : ""}
            </Tag>
        );
    }
    return <Tag tom="amarelo">NP ABERTA</Tag>;
}

export default function FinanceiroOSPage() {
    /* Padrão de 08/10/2026: tudo de filtro no botão Filtros (seleção múltipla), cartões compactos e lista que cabe na tela. */
    const [filtro, setFiltro] = useState<FiltroOS>(() => filtroInicial());
    const [janelaFiltros, setJanelaFiltros] = useState(false);
    const [painel, setPainel] = useState<any>(null);
    const [convenios, setConvenios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [aberta, setAberta] = useState<any>(null);
    const [resumo, setResumo] = useState<any>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");
        try {
            const r = await osGet("financeiro_painel", paramsDoFiltro(filtro));
            setPainel(r.dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o painel.");
        } finally {
            setLoading(false);
        }
    }, [filtro]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    useEffect(() => {
        osGet("convenios_listar")
            .then((r) => setConvenios(r.dados || []))
            .catch(() => { });
    }, []);

    const linhasOS: any[] = painel?.os || [];
    const opAgentes = useOpcoesAgente(linhasOS);
    const opConvenios = useMemo(
        () =>
            convenios
                .filter((c: any) => c.codigo && c.tipo !== "PARTICULAR")
                .map((c: any) => ({ v: String(c.codigo), r: c.tipo === "PREFEITURA" ? `Prefeitura de ${c.nome}` : `Plano ${c.nome}` })),
        [convenios],
    );
    const mostrar = { tipo: TIPOS_OS, situacao: SITUACOES_OS, agente: opAgentes, convenio: opConvenios };

    const ind = painel?.indicadores;
    const vt = ind?.vendas_por_tipo || {};
    const totalLista = linhasOS.reduce((a, l) => a + (l.status === "CONVERTIDA" ? 0 : Number(l.valor_total) || 0), 0);

    const tabela = (): TabelaExport => ({
        titulo: "Financeiro da OS",
        subtitulo: `${dataBROS(filtro.data_inicio)} a ${dataBROS(filtro.data_fim)} · ${linhasOS.length} OS`,
        cabecalho: ["OS", "Situação", "Tipo", "Falecido", "Responsável", "Agente", "Aberta em", "Total", "Recebido", "Saldo"],
        linhas: linhasOS.map((l) => [
            l.numero_os, situacaoDaOS(l).texto, l.tipo_rotulo, l.falecido || "—", l.responsavel || "—", l.agente || "—", dataBROS(l.criado_em),
            brl(l.valor_total), l.recebido ? brl(l.recebido) : "—", l.saldo === null ? (l.tipo === "SOC" ? "Coberto" : "—") : brl(l.saldo),
        ]),
        rodape: `Total da lista: ${brl(totalLista)}`,
        arquivo: `financeiro-os-${filtro.data_inicio}-a-${filtro.data_fim}`,
    });

    const linhaDe = (osId: any) => linhasOS.find((l) => l.os_id === osId);

    return (
        <main className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <BarraFiltrosOS
                    filtro={filtro}
                    mostrar={mostrar}
                    onAbrirFiltros={() => setJanelaFiltros(true)}
                    onMudar={setFiltro}
                    exportar={itensExportar(tabela)}
                    extra={
                        <>
                            <a href="/os/relatorio" className="hidden h-11 items-center rounded-xl border-[1.5px] border-[#C9D1DE] px-3.5 text-[15px] font-bold dark:border-white/25 sm:inline-flex">Relatório de atendimentos</a>
                            <a href="/convenio" className="hidden h-11 items-center rounded-xl border-[1.5px] border-[#C9D1DE] px-3.5 text-[15px] font-bold dark:border-white/25 sm:inline-flex">Convênios</a>
                            <MaisAtalhos />
                        </>
                    }
                />

                {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

                {ind && (
                    <>
                        <CartoesOS
                            itens={[
                                { rotulo: "Total de vendas", valor: brl(ind.total_vendas), cor: "#313C55", sub: `Prt ${brl(vt.PRT)} · Dif ${brl((vt.DIF_SOC || 0) + (vt.DIF_PRF || 0))} · Cor ${brl(vt.COR)} · Prf ${brl(vt.PRF)}` },
                                { rotulo: "A receber", valor: brl(ind.a_receber), cor: "#F2CB3F", sub: "saldo das OS assinadas" },
                                { rotulo: "Recebido no período", valor: brl(ind.recebido_no_periodo), cor: "#B3CE52" },
                                { rotulo: "NPs abertas", valor: String(ind.nps_abertas?.quantidade || 0), cor: "#3D6A99", sub: `${brl(ind.nps_abertas?.valor)} à vista` },
                                { rotulo: "Aguardando assinatura", valor: String(ind.aguardando_assinatura?.quantidade || 0), cor: "#C9CFD9", sub: `${brl(ind.aguardando_assinatura?.valor)} sem NP` },
                                { rotulo: "Cobertura dos planos", valor: brl(ind.cobertura_planos), cor: "#B3CE52", sub: "no período" },
                            ]}
                        />
                        {(ind.nps_a_devolver > 0 || ind.creditos_a_devolver > 0) && (
                            <div className="flex flex-wrap gap-2">
                                {ind.nps_a_devolver > 0 && <Tag tom="amarelo">{ind.nps_a_devolver} NP A DEVOLVER AO EMITENTE</Tag>}
                                {ind.creditos_a_devolver > 0 && <Tag tom="laranja">CRÉDITOS A DEVOLVER: {brl(ind.creditos_a_devolver)}</Tag>}
                            </div>
                        )}
                    </>
                )}

                <ListaCompactaOS
                    titulo={`${linhasOS.length} OS`}
                    total={linhasOS.length ? brl(totalLista) : undefined}
                    carregando={loading}
                    vazio="Nenhuma OS no período."
                    linhas={linhasOS.map((l) => ({
                        chave: l.os_id,
                        numero: l.numero_os,
                        situacao: situacaoDaOS(l),
                        valor: brl(l.valor_total),
                        nome: l.falecido || "—",
                        meta: [l.tipo_rotulo, l.agente, dataBROS(l.criado_em)].filter(Boolean).join(" · "),
                    }))}
                    onAbrir={(id) => setAberta(linhaDe(id))}
                    onMais={(id) => setResumo(linhaDe(id))}
                />
            </div>

            {janelaFiltros && (
                <JanelaFiltrosOS valor={filtro} mostrar={mostrar} onFechar={() => setJanelaFiltros(false)} onAplicar={(f) => (setFiltro(f), setJanelaFiltros(false))} />
            )}

            {resumo && (
                <ResumoOS
                    numero={resumo.numero_os}
                    situacao={situacaoDaOS(resumo)}
                    subtitulo={resumo.tipo_rotulo}
                    onFechar={() => setResumo(null)}
                    campos={[
                        ["Falecido", resumo.falecido || "—"],
                        ["Responsável", resumo.responsavel || "—"],
                        ["Agente", resumo.agente || "—"],
                        ["Aberta em", dataBROS(resumo.criado_em)],
                        ...(resumo.assinada_em ? ([["Assinada em", dataBROS(resumo.assinada_em)]] as [string, React.ReactNode][]) : []),
                        ["Total", brl(resumo.valor_total), true],
                        ["Recebido", resumo.recebido ? brl(resumo.recebido) : "—"],
                        ["Saldo", resumo.saldo === null ? (resumo.tipo === "SOC" ? "Coberto pelo plano" : "—") : brl(resumo.saldo), true],
                        ...(resumo.nota_promissoria ? ([["Nota promissória", tagNP(resumo.nota_promissoria)]] as [string, React.ReactNode][]) : []),
                        ...(resumo.credito_a_devolver > 0 ? ([["Crédito a devolver", brl(resumo.credito_a_devolver)]] as [string, React.ReactNode][]) : []),
                    ]}
                    acoes={[
                        { rotulo: "PDF", icone: <Icone d={Ic.pdf} tam={18} />, onClick: () => void baixarPdfDaOS(resumo.os_id, resumo.numero_os).then((m) => m && setMsg(m)) },
                        { rotulo: "Imprimir", icone: <Icone d={Ic.imprimir} tam={18} />, onClick: () => window.open(`${OS_API}?documento_os=1&os_id=${resumo.os_id}&formato=impressao`, "_blank") },
                        { rotulo: "Abrir OS", icone: <Icone d={Ic.abrir} tam={18} />, primaria: true, onClick: () => (setAberta(resumo), setResumo(null)) },
                    ]}
                />
            )}

            {aberta && (
                <DetalheOS
                    linha={aberta}
                    onFechar={() => setAberta(null)}
                    onAlterou={(m) => {
                        setMsg(m);
                        void carregar();
                    }}
                />
            )}
        </main>
    );
}

/** No celular, Relatório e Convênios ficam no ⋮ ao lado de Exportar (no computador aparecem como botões). */
function MaisAtalhos() {
    const [aberto, setAberto] = useState(false);
    return (
        <div className="relative sm:hidden">
            <button type="button" aria-label="Relatório de atendimentos e Convênios" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
                className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white dark:border-white/25 dark:bg-[#232B3F]">
                <Icone d={Ic.mais} />
            </button>
            {aberto && (
                <>
                    <div className="fixed inset-0 z-40" data-pai-sem-folga onClick={() => setAberto(false)} aria-hidden="true" />
                    <div role="menu" className="absolute right-0 top-12 z-50 w-60 rounded-[14px] border border-[#E3E8F0] bg-white p-1.5 shadow-2xl dark:border-white/[0.12] dark:bg-[#232B3F]">
                        <a role="menuitem" href="/os/relatorio" className="flex min-h-11 items-center rounded-xl px-3 text-[15px] font-bold hover:bg-[#EEF2F7] dark:hover:bg-white/10">Relatório de atendimentos</a>
                        <a role="menuitem" href="/convenio" className="flex min-h-11 items-center rounded-xl px-3 text-[15px] font-bold hover:bg-[#EEF2F7] dark:hover:bg-white/10">Convênios</a>
                    </div>
                </>
            )}
        </div>
    );
}

function DetalheOS({
    linha,
    onFechar,
    onAlterou,
}: {
    linha: any;
    onFechar: () => void;
    onAlterou: (msg: string) => void;
}) {
    const [fin, setFin] = useState<any>(null);
    const [tempo, setTempo] = useState<any[]>([]);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [rec, setRec] = useState({
        forma_pagamento: "PIX",
        valor: "",
        data_pagamento: hoje(),
        observacao: "",
    });
    const [estorno, setEstorno] = useState<any>(null);
    const [motivoEstorno, setMotivoEstorno] = useState("");
    const [conv, setConv] = useState<any>(null);
    const [prefeituras, setPrefeituras] = useState<any[]>([]);

    const osId = linha.os_id;
    const [statusAtual, setStatusAtual] = useState<string>(linha.status);
    const [reabrir, setReabrir] = useState(false);
    const [motivoReabrir, setMotivoReabrir] = useState("");
    const [versaoItens, setVersaoItens] = useState(0);
    /** OS cobrada da família (Particular, diferenças e coroa): valores ajustáveis. */
    const ehDaFamilia = ["PRT", "DIF_SOC", "DIF_PRF", "COR"].includes(linha.tipo);
    const podeReabrir = ehDaFamilia && statusAtual === "FECHADA";

    const carregar = useCallback(async () => {
        setErro("");
        try {
            const [f, t] = await Promise.all([
                osGet("financeiro_listar", { os_id: osId }),
                osGet("linha_do_tempo", { os_id: osId }),
            ]);
            setFin(f.dados);
            setTempo(t.dados || []);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar a OS.");
        }
    }, [osId]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const executar = async (fn: () => Promise<any>, ok: string) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        try {
            const r = await fn();
            onAlterou(r?.msg || ok);
            await carregar();
            return r;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setSalvando(false);
        }
    };

    const proposta = fin?.financeiro;
    const saldo = fin?.saldo;
    const saldoApos = Math.max(
        0,
        (saldo?.saldo_restante ?? linha.saldo ?? 0) -
        (Number(String(rec.valor).replace(",", ".")) || 0),
    );

    const podeReceber =
        ["PRT", "DIF_SOC", "DIF_PRF", "COR", "PRF"].includes(linha.tipo) &&
        linha.status !== "CONVERTIDA";

    const lancar = () =>
        executar(async () => {
            let finId = proposta?.id;

            if (!finId) {
                const p = await osPost("financeiro_criar_proposta", {
                    os_id: osId,
                    valor_alvo: linha.valor_total,
                    tipo_proposta: "MISTO",
                });
                finId = p.dados?.id;
            }

            const r = await osPost("financeiro_registrar_pagamento", {
                financeiro_id: finId,
                ...rec,
                valor: String(rec.valor).replace(",", "."),
            });

            setRec({
                ...rec,
                valor: "",
                observacao: "",
            });

            return r;
        }, "Recebimento lançado.");

    const abrirConversao = async () => {
        const r = await osGet("convenios_listar").catch(() => null);

        setPrefeituras(
            (r?.dados || []).filter(
                (c: any) =>
                    c.codigo &&
                    c.tipo === "PREFEITURA" &&
                    c.ativo,
            ),
        );

        setConv({
            convenio: "",
            tanatopraxia_autorizada: "0",
            translado_autorizado: "0",
            motivo: "",
            previa: null,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-[rgba(49,60,85,0.45)]"
            onClick={onFechar}
        >
            <div
                className="h-full w-full max-w-5xl overflow-y-auto bg-[#F4F6F9] p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-sm text-[#6B7488]">
                            Financeiro › {linha.tipo_rotulo}
                        </div>
                        <h2 className="text-2xl font-extrabold">
                            OS {linha.numero_os} · {linha.falecido || "—"}
                        </h2>
                        <div className="text-sm text-[#6B7488]">
                            Responsável{" "}
                            <b className="text-[#313C55]">
                                {linha.responsavel || "—"}
                            </b>{" "}
                            · agente {linha.agente} ·{" "}
                            {linha.status === "FECHADA"
                                ? `assinada ${dataHoraBR(linha.assinada_em)}`
                                : linha.status}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <a
                            className="rounded-lg border border-[#E1E5EC] bg-white px-4 py-2 text-sm font-bold"
                            target="_blank"
                            rel="noreferrer"
                            href={`${OS_API}?documento_os=1&os_id=${osId}&formato=visualizar`}
                        >
                            Ver folha da OS
                        </a>

                        {linha.tipo === "PRT" &&
                            linha.status === "FECHADA" && (
                                <Botao
                                    onClick={() =>
                                        void abrirConversao()
                                    }
                                >
                                    Converter para Prefeitura
                                </Botao>
                            )}

                        <Botao onClick={onFechar}>Fechar</Botao>
                    </div>
                </div>

                {erro && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {erro}
                    </div>
                )}

                {/* Itens da OS: alterar valores (ícone de ajuste e desconto geral) com a OS aberta; assinada → Reabrir com motivo. */}
                <div className="mb-4 rounded-xl border border-[#E1E5EC] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="flex-1 text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">{linha.tipo === "PRF" ? "Pacotes e serviços da OS" : "Itens da OS"}</div>
                        {podeReabrir && (
                            <Botao onClick={() => { setMotivoReabrir(""); setReabrir(true); }}>Reabrir OS</Botao>
                        )}
                    </div>
                    {statusAtual === "FECHADA" && ehDaFamilia && (
                        <div className="mb-3 rounded-lg border border-[#F2CB3F] bg-[#FCF3CC] p-3 text-sm font-semibold text-[#313C55]">
                            OS assinada: para alterar valores, reabra. A assinatura e a nota promissória anteriores deixam de valer.
                        </div>
                    )}
                    {linha.tipo === "PRF" ? (
                        /* OS da Prefeitura: pacote(s) e serviços de contrato com o valor lançado, e os itens usados embaixo de cada um */
                        <ComposicaoContrato osId={osId} versao={versaoItens} />
                    ) : (
                        <ItensOSAjuste
                            osId={osId}
                            editavel={statusAtual === "ABERTA" && ehDaFamilia}
                            versao={versaoItens}
                            onMudou={() => onAlterou("Valores da OS atualizados.")}
                        />
                    )}
                </div>

                {reabrir && (
                    <Modal titulo={`Reabrir ${linha.numero_os}`} onFechar={() => setReabrir(false)}>
                        <div className="text-sm text-[#313C55]">
                            A assinatura e a nota promissória desta OS deixam de valer. Depois de alterar, o responsável assina de novo.
                        </div>
                        <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">Motivo *</label>
                        <textarea
                            className="mt-1 w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm"
                            rows={3}
                            value={motivoReabrir}
                            onChange={(e) => setMotivoReabrir(e.target.value)}
                            placeholder="Ex.: família pediu troca da urna"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <Botao onClick={() => setReabrir(false)}>Cancelar</Botao>
                            <Botao
                                primario
                                disabled={salvando || motivoReabrir.trim().length < 5}
                                onClick={() =>
                                    void executar(async () => {
                                        const r = await osPost("reabrir", { os_id: osId, motivo: motivoReabrir.trim() });
                                        setReabrir(false);
                                        setStatusAtual("ABERTA");
                                        setVersaoItens((n) => n + 1);
                                        return r;
                                    }, "OS reaberta.")
                                }
                            >
                                Reabrir
                            </Botao>
                        </div>
                    </Modal>
                )}

                <div className="mb-4 flex flex-col gap-3 lg:flex-row">
                    <Kpi
                        rotulo="Total da OS"
                        valor={brl(linha.valor_total)}
                        cor={COR.navy}
                    />
                    <Kpi
                        rotulo="Recebido"
                        valor={brl(
                            saldo?.total_pago ?? linha.recebido,
                        )}
                        cor={COR.verde}
                        sub={`${(fin?.pagamentos || []).filter((p: any) => !Number(p.estornado)).length} lançamento(s)`}
                    />
                    <Kpi
                        rotulo="Saldo"
                        valor={brl(
                            saldo?.saldo_restante ?? linha.saldo,
                        )}
                        cor={COR.amarelo}
                        sub={
                            proposta
                                ? `proposta ${String(proposta.tipo_proposta).toLowerCase()} · ${String(proposta.status).toLowerCase().replace("_", " ")}`
                                : "sem proposta"
                        }
                    />

                    <div
                        className="flex-[1.4] rounded-xl border border-[#E1E5EC] bg-white p-4"
                        style={{
                            borderTop: `4px solid ${COR.azul}`,
                        }}
                    >
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">
                            Nota promissória
                        </div>

                        {linha.nota_promissoria ? (
                            <>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="whitespace-nowrap text-2xl font-extrabold">
                                        {brl(
                                            linha.nota_promissoria.valor,
                                        )}
                                    </span>
                                    {tagNP(linha.nota_promissoria)}
                                </div>

                                <div className="text-xs text-[#6B7488]">
                                    à vista · via única
                                </div>

                                {["BAIXADA", "SUBSTITUIDA"].includes(
                                    linha.nota_promissoria.status,
                                ) &&
                                    !linha.nota_promissoria
                                        .devolvida && (
                                        <Botao
                                            className="mt-2"
                                            disabled={salvando}
                                            onClick={() =>
                                                void executar(
                                                    () =>
                                                        osPost(
                                                            "financeiro_devolver_np",
                                                            {
                                                                os_id: osId,
                                                            },
                                                        ),
                                                    "Devolução registrada.",
                                                )
                                            }
                                        >
                                            Registrar devolução ao
                                            emitente
                                        </Botao>
                                    )}
                            </>
                        ) : (
                            <div className="mt-1 text-sm text-[#6B7488]">
                                Sem nota promissória
                            </div>
                        )}
                    </div>
                </div>

                {linha.credito_a_devolver > 0 && (
                    <div className="mb-4 flex items-center justify-between rounded-xl border border-[#F2CB3F] bg-[#FFF8E1] p-4 text-sm">
                        <span>
                            Crédito a devolver à família:{" "}
                            <b>
                                {brl(
                                    linha.credito_a_devolver,
                                )}
                            </b>{" "}
                            (pago a mais na conversão)
                        </span>

                        <Botao
                            disabled={salvando}
                            onClick={() =>
                                void executar(
                                    () =>
                                        osPost(
                                            "financeiro_devolver_credito",
                                            { os_id: osId },
                                        ),
                                    "Devolução do crédito registrada.",
                                )
                            }
                        >
                            Registrar devolução
                        </Botao>
                    </div>
                )}

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-4">
                        <div className="rounded-xl border border-[#E1E5EC] bg-white p-4">
                            <div className="mb-2 text-lg font-extrabold">
                                Lançamentos
                            </div>

                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#E1E5EC] text-left text-[11px] uppercase tracking-wider text-[#6B7488]">
                                        <th className="py-2">
                                            Data
                                        </th>
                                        <th>Forma</th>
                                        <th className="text-right">
                                            Valor
                                        </th>
                                        <th className="pl-3">
                                            Observação
                                        </th>
                                        <th />
                                    </tr>
                                </thead>

                                <tbody>
                                    {(fin?.pagamentos || [])
                                        .length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="py-4 text-[#6B7488]"
                                                >
                                                    Nenhum recebimento.
                                                </td>
                                            </tr>
                                        )}

                                    {(fin?.pagamentos || []).map(
                                        (p: any) => (
                                            <tr
                                                key={p.id}
                                                className={`border-b border-[#E1E5EC] ${Number(
                                                    p.estornado,
                                                )
                                                        ? "text-[#6B7488] line-through"
                                                        : ""
                                                    }`}
                                            >
                                                <td className="py-2">
                                                    {dataBR(
                                                        p.data_pagamento,
                                                    )}
                                                </td>
                                                <td>
                                                    {String(
                                                        p.forma_pagamento,
                                                    ).replace(
                                                        "_",
                                                        " ",
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap text-right font-bold">
                                                    {brl(p.valor)}
                                                </td>
                                                <td className="pl-3 text-xs">
                                                    {p.observacao || ""}
                                                    {(
                                                        p.comprovantes ||
                                                        []
                                                    ).map(
                                                        (
                                                            c: any,
                                                        ) => (
                                                            <a
                                                                key={
                                                                    c.id ||
                                                                    c.arquivo_url
                                                                }
                                                                className="ml-2 font-bold text-[#00AEEC]"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                href={
                                                                    c.arquivo_url
                                                                }
                                                            >
                                                                comprovante
                                                            </a>
                                                        ),
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    {!Number(
                                                        p.estornado,
                                                    ) && (
                                                            <button
                                                                type="button"
                                                                className="text-xs font-bold text-[#C0392B]"
                                                                onClick={() => {
                                                                    setEstorno(
                                                                        p,
                                                                    );
                                                                    setMotivoEstorno(
                                                                        "",
                                                                    );
                                                                }}
                                                            >
                                                                Estornar
                                                            </button>
                                                        )}
                                                </td>
                                            </tr>
                                        ),
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-xl border border-[#E1E5EC] bg-white p-4">
                            <div className="mb-2 flex justify-between">
                                <span className="text-lg font-extrabold">
                                    Linha do tempo
                                </span>
                                <span className="text-xs text-[#6B7488]">
                                    todas as OS do atendimento
                                </span>
                            </div>

                            {tempo.length === 0 && (
                                <div className="text-sm text-[#6B7488]">
                                    Sem eventos.
                                </div>
                            )}

                            {tempo.map(
                                (e: any, i: number) => (
                                    <div
                                        key={i}
                                        className="flex gap-3 border-b border-[#E1E5EC] py-2 text-sm last:border-b-0"
                                    >
                                        <span
                                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{
                                                background:
                                                    [
                                                        "ASSINADA",
                                                        "RECEBIMENTO",
                                                        "NP_BAIXADA",
                                                    ].includes(
                                                        e.tipo,
                                                    )
                                                        ? COR.verde
                                                        : [
                                                            "NP_EMITIDA",
                                                            "DOCUMENTO",
                                                        ].includes(
                                                            e.tipo,
                                                        )
                                                            ? COR.azul
                                                            : [
                                                                "DESCONTO",
                                                                "ESTORNO",
                                                                "CONVERTIDA",
                                                            ].includes(
                                                                e.tipo,
                                                            )
                                                                ? COR.amarelo
                                                                : COR.muted,
                                            }}
                                        />

                                        <span className="w-28 shrink-0 text-[#6B7488]">
                                            {dataHoraBR(e.data)}
                                        </span>

                                        <span className="flex-1">
                                            <b className="mr-1 text-xs">
                                                {e.os}
                                            </b>
                                            {e.descricao}
                                        </span>

                                        <span className="text-xs text-[#6B7488]">
                                            {e.usuario || ""}
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    {podeReceber && (
                        <div className="w-full shrink-0 rounded-xl border border-[#E1E5EC] bg-white p-4 lg:w-[310px]">
                            <div className="mb-3 text-lg font-extrabold">
                                Registrar recebimento
                            </div>

                            <div className="mb-3 grid grid-cols-2 gap-2">
                                <Campo rotulo="Forma">
                                    <select
                                        className={inputCls}
                                        value={
                                            rec.forma_pagamento
                                        }
                                        onChange={(e) =>
                                            setRec({
                                                ...rec,
                                                forma_pagamento:
                                                    e.target.value,
                                            })
                                        }
                                    >
                                        {FORMAS.map((f) => (
                                            <option
                                                key={f}
                                                value={f}
                                            >
                                                {f.replace("_", " ")}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>

                                <Campo rotulo="Data">
                                    <input
                                        type="date"
                                        className={inputCls}
                                        value={
                                            rec.data_pagamento
                                        }
                                        max={hoje()}
                                        onChange={(e) =>
                                            setRec({
                                                ...rec,
                                                data_pagamento:
                                                    e.target.value,
                                            })
                                        }
                                    />
                                </Campo>
                            </div>

                            <div className="mb-3">
                                <Campo rotulo="Valor">
                                    <input
                                        inputMode="decimal"
                                        className={inputCls}
                                        placeholder="0,00"
                                        value={rec.valor}
                                        onChange={(e) =>
                                            setRec({
                                                ...rec,
                                                valor: e.target.value,
                                            })
                                        }
                                    />
                                </Campo>
                            </div>

                            <div className="mb-3">
                                <Campo rotulo="Observação">
                                    <textarea
                                        className={inputCls}
                                        rows={2}
                                        value={rec.observacao}
                                        onChange={(e) =>
                                            setRec({
                                                ...rec,
                                                observacao:
                                                    e.target.value,
                                            })
                                        }
                                    />
                                </Campo>
                            </div>

                            <div className="mb-3 rounded-lg bg-[#F4F6F9] p-3 text-sm">
                                Saldo após o lançamento:{" "}
                                <b>{brl(saldoApos)}</b>
                                <br />
                                <span className="text-[#6B7488]">
                                    A NP continua aberta até o saldo
                                    zerar.
                                </span>
                            </div>

                            <Botao
                                primario
                                disabled={salvando || !rec.valor}
                                onClick={() => void lancar()}
                            >
                                {salvando
                                    ? "Lançando…"
                                    : "Lançar recebimento"}
                            </Botao>
                        </div>
                    )}
                </div>

                {estorno && (
                    <Modal
                        titulo="Estornar recebimento"
                        sub="Somente administrador · o lançamento fica no histórico, marcado como estornado"
                        onFechar={() => setEstorno(null)}
                    >
                        <div className="mb-3 rounded-lg bg-[#F4F6F9] p-3">
                            {dataBR(estorno.data_pagamento)} ·{" "}
                            {String(
                                estorno.forma_pagamento,
                            ).replace("_", " ")}{" "}
                            · <b>{brl(estorno.valor)}</b>
                        </div>

                        <Campo rotulo="Motivo (obrigatório)">
                            <textarea
                                className={inputCls}
                                rows={2}
                                value={motivoEstorno}
                                onChange={(e) =>
                                    setMotivoEstorno(
                                        e.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <div className="my-3 rounded-lg border border-[#F2CB3F] bg-[#FFF8E1] p-3 text-sm">
                            Depois do estorno o saldo volta e a
                            nota promissória volta a ABERTA.
                        </div>

                        <div className="flex justify-end gap-2">
                            <Botao onClick={() => setEstorno(null)}>
                                Cancelar
                            </Botao>

                            <Botao
                                perigo
                                disabled={
                                    salvando ||
                                    !motivoEstorno.trim()
                                }
                                onClick={() =>
                                    void executar(
                                        () =>
                                            osPost(
                                                "financeiro_estornar_pagamento",
                                                {
                                                    pagamento_id:
                                                        estorno.id,
                                                    motivo: motivoEstorno,
                                                },
                                            ),
                                        "Estorno registrado.",
                                    ).then(() =>
                                        setEstorno(null),
                                    )
                                }
                            >
                                Confirmar estorno
                            </Botao>
                        </div>
                    </Modal>
                )}

                {conv && (
                    <Modal
                        titulo="Converter para Prefeitura + Diferença"
                        sub={`Somente administrador · a OS ${linha.numero_os} fica no histórico como CONVERTIDA`}
                        onFechar={() => setConv(null)}
                    >
                        <div className="mb-3 grid grid-cols-1 gap-2">
                            <Campo rotulo="Prefeitura">
                                <select
                                    className={inputCls}
                                    value={conv.convenio}
                                    onChange={(e) =>
                                        setConv({
                                            ...conv,
                                            convenio:
                                                e.target.value,
                                            previa: null,
                                        })
                                    }
                                >
                                    <option value="">
                                        Selecione
                                    </option>

                                    {prefeituras.map((p: any) => (
                                        <option
                                            key={p.codigo}
                                            value={p.codigo}
                                        >
                                            {p.nome}
                                        </option>
                                    ))}
                                </select>
                            </Campo>
                        </div>

                        {[
                            [
                                "tanatopraxia_autorizada",
                                "A Prefeitura autorizou a tanatopraxia?",
                            ],
                            [
                                "translado_autorizado",
                                "A Prefeitura autorizou o translado?",
                            ],
                        ].map(([k, r]) => (
                            <div
                                key={k}
                                className="mb-2 flex items-center justify-between rounded-lg border border-[#F2CB3F] bg-[#FFF8E1] px-3 py-2 text-sm font-bold"
                            >
                                <span>{r}</span>

                                <span className="inline-flex overflow-hidden rounded-lg">
                                    {[
                                        ["1", "Sim"],
                                        ["0", "Não"],
                                    ].map(([v, t]) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() =>
                                                setConv({
                                                    ...conv,
                                                    [k]: v,
                                                    previa: null,
                                                })
                                            }
                                            className={`px-3 py-1 ${conv[k] === v
                                                    ? "bg-[#313C55] text-white"
                                                    : "border border-[#E1E5EC] bg-white text-[#6B7488]"
                                                }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </span>
                            </div>
                        ))}

                        <div className="my-3">
                            <Campo rotulo="Motivo (obrigatório)">
                                <textarea
                                    className={inputCls}
                                    rows={2}
                                    value={conv.motivo}
                                    onChange={(e) =>
                                        setConv({
                                            ...conv,
                                            motivo: e.target.value,
                                        })
                                    }
                                />
                            </Campo>
                        </div>

                        {conv.previa ? (
                            <div className="mb-3 rounded-lg bg-[#F4F6F9] p-3 text-sm">
                                <table className="mb-2 w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[#6B7488]">
                                            <th>Item</th>
                                            <th className="text-right">
                                                Lançado
                                            </th>
                                            <th className="pl-2">
                                                Regra
                                            </th>
                                            <th className="text-right">
                                                Família
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conv.previa.itens.map(
                                            (
                                                i: any,
                                                n: number,
                                            ) => (
                                                <tr
                                                    key={n}
                                                    className="border-t border-[#E1E5EC]"
                                                >
                                                    <td className="py-1">
                                                        {i.item}
                                                    </td>
                                                    <td className="text-right">
                                                        {brl(
                                                            i.lancado,
                                                        )}
                                                    </td>
                                                    <td className="pl-2 text-[#6B7488]">
                                                        {i.regra}
                                                    </td>
                                                    <td className="text-right font-bold">
                                                        {brl(
                                                            i.diferenca,
                                                        )}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>

                                <div>
                                    Prefeitura (pacote + serviços
                                    autorizados):{" "}
                                    <b>
                                        {brl(
                                            conv.previa
                                                .valor_prefeitura,
                                        )}
                                    </b>
                                </div>

                                <div>
                                    Família (diferença por item):{" "}
                                    <b>
                                        {brl(
                                            conv.previa
                                                .valor_familia,
                                        )}
                                    </b>{" "}
                                    · já pago{" "}
                                    {brl(conv.previa.ja_pago)}
                                </div>

                                <div className="mt-1 font-bold">
                                    {conv.previa.precisa_assinar
                                        ? `Novo saldo ${brl(conv.previa.novo_saldo)} — o responsável assina a Dif.Prf com a nova NP; a NP antiga fica SUBSTITUÍDA.`
                                        : conv.previa
                                            .credito_a_devolver >
                                            0
                                            ? `Crédito a devolver à família: ${brl(conv.previa.credito_a_devolver)}.`
                                            : "A diferença já está quitada."}
                                </div>
                            </div>
                        ) : (
                            <div className="mb-3 rounded-lg bg-[#F4F6F9] p-3 text-xs leading-5">
                                A diferença é calculada{" "}
                                <b>por item</b>: item do pacote com
                                o modelo padrão fica coberto; item
                                trocado paga o valor lançado menos
                                o valor do item no contrato; item
                                fora do pacote ou serviço não
                                autorizado fica inteiro na Dif.Prf.
                                Veja a prévia antes de confirmar.
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Botao onClick={() => setConv(null)}>
                                Cancelar
                            </Botao>

                            {!conv.previa ? (
                                <Botao
                                    primario
                                    disabled={
                                        salvando ||
                                        !conv.convenio
                                    }
                                    onClick={() =>
                                        void osGet(
                                            "converter_prefeitura",
                                            {
                                                os_id: osId,
                                                convenio:
                                                    conv.convenio,
                                                tanatopraxia_autorizada:
                                                    conv.tanatopraxia_autorizada,
                                                translado_autorizado:
                                                    conv.translado_autorizado,
                                                simular: "1",
                                            },
                                        )
                                            .then((r) =>
                                                setConv({
                                                    ...conv,
                                                    previa: r.dados,
                                                }),
                                            )
                                            .catch((e) =>
                                                setErro(
                                                    e?.message ||
                                                    "Não foi possível calcular a prévia.",
                                                ),
                                            )
                                    }
                                >
                                    Ver prévia
                                </Botao>
                            ) : (
                                <Botao
                                    primario
                                    disabled={
                                        salvando ||
                                        !conv.motivo.trim()
                                    }
                                    onClick={() =>
                                        void executar(
                                            () =>
                                                osPost(
                                                    "converter_prefeitura",
                                                    {
                                                        os_id: osId,
                                                        convenio:
                                                            conv.convenio,
                                                        tanatopraxia_autorizada:
                                                            conv.tanatopraxia_autorizada,
                                                        translado_autorizado:
                                                            conv.translado_autorizado,
                                                        motivo: conv.motivo,
                                                    },
                                                ),
                                            "OS convertida.",
                                        ).then((r) =>
                                            r && onFechar(),
                                        )
                                    }
                                >
                                    Confirmar conversão
                                </Botao>
                            )}
                        </div>
                    </Modal>
                )}
            </div>
        </div>
    );
}

/* ====================================================================== */
/* OS da Prefeitura no Financeiro: cada pacote / serviço de contrato com o valor lançado e, embaixo, só os itens usados no atendimento. */

type GrupoContrato = {
    tipo: "PACOTE" | "CONTRATO" | "SEM_VALOR";
    titulo: string;
    subtitulo: string;
    valor: number;
    itens: { nome: string; categoria: string; quantidade: number; detalhe: string }[];
};

function ComposicaoContrato({ osId, versao = 0 }: { osId: number; versao?: number }) {
    const [d, setD] = useState<{ grupos: GrupoContrato[]; soma: number; valor_total: number } | null>(null);
    const [erro, setErro] = useState("");
    useEffect(() => {
        let vivo = true;
        osGet("composicao_contrato_os", { os_id: osId })
            .then((r) => vivo && (setD(r.dados), setErro("")))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível carregar a composição da OS."));
        return () => {
            vivo = false;
        };
    }, [osId, versao]);

    if (erro) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>;
    if (!d) return <div className="py-2 text-sm text-[#6B7488]">Carregando…</div>;
    if (!d.grupos.length) return <div className="py-2 text-sm text-[#6B7488]">Nenhum pacote ou serviço lançado nesta OS.</div>;
    const diverge = Math.abs(Number(d.soma) - Number(d.valor_total)) > 0.005;

    return (
        <div>
            <div className="flex flex-col gap-2.5">
                {d.grupos.map((g, i) => (
                    <div key={i} className="rounded-xl border border-[#E1E5EC] bg-white">
                        <div className="flex items-start gap-3 border-b border-[#E1E5EC] px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-[15px] font-extrabold leading-tight text-[#313C55]">{g.titulo}</div>
                                <div className="text-xs text-[#6B7488]">{g.subtitulo}</div>
                            </div>
                            <div className="whitespace-nowrap text-lg font-extrabold text-[#313C55]">{g.tipo === "SEM_VALOR" ? "—" : brl(g.valor)}</div>
                        </div>
                        {g.itens.length ? (
                            <ul className="px-4 py-2 text-sm">
                                {g.itens.map((it, j) => (
                                    <li key={j} className="flex items-baseline gap-2 py-0.5">
                                        <span className="text-[#6B7488]">•</span>
                                        <span className="min-w-0 flex-1">
                                            <b className="font-bold text-[#313C55]">{it.nome}</b>
                                            <span className="text-xs text-[#6B7488]">
                                                {" "}· {it.categoria}
                                                {it.quantidade > 1 ? ` · ${it.quantidade} un.` : ""}
                                                {it.detalhe ? ` · ${it.detalhe}` : ""}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="px-4 py-2 text-xs text-[#6B7488]">Nenhum item do atendimento neste pacote.</div>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-right">
                {diverge ? (
                    <span className="rounded-lg bg-[#FCF3CC] px-2.5 py-1 text-xs font-bold text-[#313C55]">
                        Soma dos pacotes e serviços: {brl(d.soma)} (diferente do total gravado)
                    </span>
                ) : null}
                <span className="text-lg font-extrabold text-[#313C55]">Total da OS: {brl(d.valor_total)}</span>
            </div>
        </div>
    );
}

function Modal({
    titulo,
    sub,
    children,
    onFechar,
}: {
    titulo: string;
    sub?: string;
    children: React.ReactNode;
    onFechar: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(49,60,85,0.45)] p-4"
            onClick={onFechar}
        >
            <div
                className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-xl font-extrabold">
                    {titulo}
                </div>
                {sub && (
                    <div className="mb-4 text-sm text-[#6B7488]">
                        {sub}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
