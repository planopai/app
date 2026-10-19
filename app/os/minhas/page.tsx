"use client";

import React, { useCallback, useEffect, useState } from "react";
import ItensOSAjuste from "../components/ItensOSAjuste";
import OSDoAtendimento, { JanelaOSPorId } from "../components/OSDoAtendimento";
import {
    BarraFiltrosOS, CartoesOS, EstiloTemaOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, PAGAMENTOS_OS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, metaFinanceiraOS, prepararPdfDaOS, filtroInicial, itensExportar, paramsDoFiltro, situacaoDaOS, type FiltroOS, type TabelaExport,
} from "../components/ListaOS";
import { OS_API, apiJson, osGet, osPost } from "../components/apiOS";
import { AbasRelatorio, PendenciasOS, docPendencias, imprimirRelatorio } from "../components/RelatoriosOS";

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-base sm:text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#3D6A99] dark:focus:border-[#3D6A99]";

/* ====================================================================== */

export default function MinhasOSPage() {
    /* Padrão de 08/10/2026: filtros no botão Filtros (seleção múltipla), cartões numa linha e lista que cabe na tela. */
    const [filtro, setFiltro] = useState<FiltroOS>(() => filtroInicial());
    const [janelaFiltros, setJanelaFiltros] = useState(false);
    const [dados, setDados] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [loading, setLoading] = useState(true);
    const [aberta, setAberta] = useState<number | null>(null);
    const [resumo, setResumo] = useState<any>(null);
    /* Pendências do agente (19/10/2026): mesma lista do Relatório Pendências, só as OS dele, situação de hoje. */
    const [vista, setVista] = useState<"os" | "pendencias">("os");
    const [pend, setPend] = useState<any>(null);
    const [carregandoPend, setCarregandoPend] = useState(false);
    const [numeroAberta, setNumeroAberta] = useState("");
    /* Janela "Ver OS" do Editar registro: /os/minhas?atendimento=<id> mostra só as OS daquele atendimento. */
    const [atendimentoDaUrl, setAtendimentoDaUrl] = useState<string | null>(null);
    useEffect(() => {
        const a = new URLSearchParams(window.location.search).get("atendimento");
        if (a && /^\d+$/.test(a)) setAtendimentoDaUrl(a);
    }, []);

    const carregar = useCallback(async () => {
        if (new URLSearchParams(window.location.search).get("atendimento")) return;   // janela do atendimento não carrega a lista
        setLoading(true);
        setErro("");
        try {
            setDados((await osGet("minhas_os", paramsDoFiltro(filtro))).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar suas OS.");
        } finally {
            setLoading(false);
        }
    }, [filtro]);
    useEffect(() => { void carregar(); }, [carregar]);

    const carregarPendencias = useCallback(async () => {
        setCarregandoPend(true);
        setErro("");
        try {
            setPend((await osGet("minhas_pendencias")).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar suas pendências.");
        } finally {
            setCarregandoPend(false);
        }
    }, []);
    useEffect(() => { if (vista === "pendencias") void carregarPendencias(); }, [vista, carregarPendencias]);

    const lista: any[] = dados?.os || [];
    if (atendimentoDaUrl) {
        const avisarJanelaDeOrigem = () => {
            try { window.opener?.postMessage({ pai: "os-atualizada", atendimento_id: atendimentoDaUrl }, window.location.origin); } catch { /* janela fechada */ }
        };
        // Aberta em outra janela (Editar registro): fecha a janela. Aberta na mesma aba (botão da OS no Quadro): volta.
        const fechar = () => {
            if (window.opener) window.close();
            else if (window.history.length > 1) window.history.back();
            else window.location.href = "/quadro-acompanhamento";
        };
        // Aberta pelo atalho (Quadro, Atendimentos): por cima da tela, para os botões de baixo não ficarem atrás da barra do celular.
        return <OSDoAtendimento sobreposto atendimentoId={atendimentoDaUrl} onFechar={fechar} onMudou={avisarJanelaDeOrigem} />;
    }
    const emAberto = lista.filter((l) => l.status === "ABERTA").length;
    // Concluída = venda fechada sem assinatura; Assinada = com assinatura (09/10/2026). Antes o cartão "Assinadas" contava as duas.
    const concluidas = lista.filter((l) => l.status === "FECHADA" && !l.assinada_em);
    const assinadas = lista.filter((l) => l.status === "FECHADA" && l.assinada_em);
    const somaDe = (ls: any[]) => brl(ls.reduce((a, l) => a + (Number(l.valor_total) || 0), 0));
    const mostrar = { tipo: TIPOS_OS, situacao: SITUACOES_OS, pagamento: PAGAMENTOS_OS };
    const totalLista = lista.reduce((a, l) => a + (l.status === "CONVERTIDA" ? 0 : Number(l.valor_total) || 0), 0);
    const acompanhamento = (l: any) =>
        l.status === "ABERTA" ? "Concluir venda" : l.status === "FECHADA" && !l.assinada_em ? "Colher assinatura" : l.saldo ? `Saldo ${brl(l.saldo)} (financeiro)` : l.nota_promissoria ? `NP ${brl(l.nota_promissoria.valor)}` : "—";
    const tabela = (): TabelaExport => ({
        titulo: "Minhas OS",
        subtitulo: `${dataBROS(filtro.data_inicio)} a ${dataBROS(filtro.data_fim)} · ${lista.length} OS`,
        cabecalho: ["OS", "Situação", "Tipo", "Falecido", "Aberta em", "Total", "Acompanhamento"],
        linhas: lista.map((l) => [l.numero_os, situacaoDaOS(l).texto, l.tipo_rotulo, l.falecido || "—", dataBROS(l.criado_em), brl(l.valor_total), acompanhamento(l)]),
        rodape: `Total da lista: ${brl(totalLista)}`,
        arquivo: `minhas-os-${filtro.data_inicio}-a-${filtro.data_fim}`,
    });

    return (
        <main data-os-tela className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <EstiloTemaOS />
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <AbasRelatorio opcoes={[["os", "Minhas OS"], ["pendencias", "Pendências"]]} valor={vista} onTrocar={setVista} />
                {vista === "pendencias" ? (
                    <>
                        <div className="flex items-center gap-2">
                            <span className="flex-1 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">Situação de hoje · só as suas OS</span>
                            <button type="button" disabled={!pend} onClick={() => imprimirRelatorio(docPendencias(pend, false, "Minhas Pendências"))}
                                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3.5 text-[15px] font-bold disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F]">
                                <Icone d={Ic.imprimir} />
                                Imprimir
                            </button>
                        </div>
                        {erro && <div className="rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                        <PendenciasOS dados={pend} carregando={carregandoPend} vista="tipo" mostrarAgente={false} onAbrir={(id, numero) => (setNumeroAberta(numero), setAberta(id))} />
                    </>
                ) : (
                <>
                <BarraFiltrosOS filtro={filtro} mostrar={mostrar} onAbrirFiltros={() => setJanelaFiltros(true)} onMudar={setFiltro} exportar={itensExportar(tabela)} />

                <CartoesOS
                    itens={[
                        { rotulo: "Em aberto", valor: String(emAberto), sub: "a finalizar", cor: "#F2CB3F" },
                        { rotulo: "Concluídas", valor: String(concluidas.length), sub: somaDe(concluidas), cor: "#3D6A99" },
                        { rotulo: "Assinadas", valor: String(assinadas.length), sub: somaDe(assinadas), cor: "#B3CE52" },
                        { rotulo: "Convertidas", valor: String(lista.filter((l) => l.status === "CONVERTIDA").length), sub: "Prt → Prf", cor: "#C9CFD9" },
                    ]}
                />

                {erro && <div className="rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {aviso && <div className="rounded-lg border border-[#E3E8F0] bg-white p-3 text-sm font-semibold dark:border-white/[0.12] dark:bg-[#232B3F]">{aviso}</div>}

                <ListaCompactaOS
                    titulo={`${lista.length} OS`}
                    total={lista.length ? brl(totalLista) : undefined}
                    carregando={loading}
                    vazio="Nenhuma OS no período."
                    linhas={lista.map((l) => ({
                        chave: l.os_id,
                        numero: l.numero_os,
                        situacao: situacaoDaOS(l),
                        valor: brl(l.valor_total),
                        nome: l.falecido || "—",
                        meta: metaFinanceiraOS(l),
                        destaque: l.status === "ABERTA",
                    }))}
                    onAbrir={(id) => setAberta(Number(id))}
                    onMais={(id) => {
                        prepararPdfDaOS(id);
                        setResumo(lista.find((l) => l.os_id === id));
                    }}
                />
                </>
                )}
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
                        ["Aberta em", dataBROS(resumo.criado_em)],
                        ["Total", brl(resumo.valor_total), true],
                        ["Acompanhamento", acompanhamento(resumo)],
                    ]}
                    acoes={[
                        { rotulo: "PDF", icone: <Icone d={Ic.pdf} tam={18} />, onClick: () => void baixarPdfDaOS(resumo.os_id, resumo.numero_os).then((m) => m && setAviso(m)) },
                        { rotulo: "Imprimir", icone: <Icone d={Ic.imprimir} tam={18} />, onClick: () => window.open(`${OS_API}?documento_os=1&os_id=${resumo.os_id}&formato=impressao`, "_blank") },
                        { rotulo: resumo.status === "ABERTA" ? "Continuar" : "Abrir OS", icone: <Icone d={Ic.abrir} tam={18} />, primaria: true, onClick: () => (setAberta(Number(resumo.os_id)), setResumo(null)) },
                    ]}
                />
            )}

            {/* A OS abre na mesma janela da OS do atendimento: Concluir venda → Colher assinatura (09/10/2026). */}
            {aberta && (
                <JanelaOSPorId
                    osId={aberta}
                    numero={lista.find((l) => l.os_id === aberta)?.numero_os || numeroAberta}
                    onFechar={() => { setAberta(null); void carregar(); if (vista === "pendencias") void carregarPendencias(); }}
                    onMudou={() => { void carregar(); if (vista === "pendencias") void carregarPendencias(); }}
                />
            )}
        </main>
    );
}
