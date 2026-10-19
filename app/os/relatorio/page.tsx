"use client";

/**
 * Relatórios da OS (16/10/2026) — uma página para os quatro relatórios (mockup "Relatórios da OS (prévia)"):
 *   ?relatorio=bonus       Relatório Particular - Cálculo de Bônus (o relatório de antes: Particular, Dif e Coroa sem translado)
 *   ?relatorio=completo    Relatório Particular - Completo (bruto, desconto, recebido, a receber, pagamentos)
 *   ?relatorio=prefeitura  Relatório Prefeitura - Prestação de Contas (resumo por serviço, atendimentos e translados)
 *   ?relatorio=socio       Relatório Sócio - Acompanhamento (coberto pelo plano, Dif da família, aditivos, custo dos itens)
 * Sem ?relatorio abre o Cálculo de Bônus, como antes. Valores por agente nos dois relatórios Particular.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    BarraFiltrosOS, CartoesOS, EstiloTemaOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, prepararPdfDaOS, filtroInicial, paramsDoFiltro, situacaoDaOS, useOpcoesAgente, type FiltroOS,
} from "../components/ListaOS";
import {
    AbasRelatorio, BlocoRelatorio, JanelaRelatorios, PendenciasOS, docPendencias, infoRelatorio, itensExportarRelatorio, nomeCompletoRelatorio, tipoRelatorioValido, urlRelatorio,
    type DocRelatorio, type TipoRelatorio,
} from "../components/RelatoriosOS";
import { OS_API, apiJson, osGet, osPost } from "../components/apiOS";

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataL = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T12:00").toLocaleDateString("pt-BR") : "—");
const TIPOS_REL = TIPOS_OS.filter((t) => ["PRT", "DIF_SOC", "DIF_PRF", "COR"].includes(t.v));
/* Relatório Particular = vendas: abre com as concluídas e as assinadas (09/10/2026). Para ver as abertas, acrescentar a situação no filtro. */
const SITUACOES_REL = SITUACOES_OS.filter((s) => s.v !== "CONVERTIDA");
const ROTULO: Record<string, string> = { PRT: "Particular", DIF_SOC: "Dif — Associado", DIF_PRF: "Dif — Prefeitura", COR: "Coroa" };
const situacaoDiasTexto = (d: any) => (d === null || d === undefined ? "—" : `${d} ${d === 1 ? "dia" : "dias"}`);
const BOTAO = "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3.5 text-[15px] font-bold dark:border-white/25 dark:bg-[#232B3F]";

function filtroDoTipo(t: TipoRelatorio, ini?: string | null, fim?: string | null): FiltroOS {
    const datas: Partial<FiltroOS> = {};
    if (ini && /^\d{4}-\d{2}-\d{2}$/.test(ini)) datas.data_inicio = ini;
    if (fim && /^\d{4}-\d{2}-\d{2}$/.test(fim)) datas.data_fim = fim;
    return filtroInicial({ ...datas, ...(t === "bonus" || t === "completo" ? { situacoes: ["CONCLUIDA", "ASSINADA"] } : {}) });
}

export default function RelatorioAtendimentosPage() {
    const [tipo, setTipo] = useState<TipoRelatorio | null>(null);
    const [filtro, setFiltro] = useState<FiltroOS>(() => filtroInicial({ situacoes: ["CONCLUIDA", "ASSINADA"] }));
    const [janelaFiltros, setJanelaFiltros] = useState(false);
    const [janelaRel, setJanelaRel] = useState(false);
    const [rel, setRel] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [resumo, setResumo] = useState<any>(null);
    const [aba, setAba] = useState<"resumo" | "atendimentos" | "translados">("resumo");
    const [vistaPend, setVistaPend] = useState<"tipo" | "agente">("tipo");   // Relatório Pendências
    const [convenios, setConvenios] = useState<any[]>([]);
    const prefeituraPadrao = useRef(false);

    // O tipo e o período vêm do endereço (a janela Relatórios do Financeiro abre /os/relatorio?relatorio=...&data_inicio=...&data_fim=...).
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const t = tipoRelatorioValido(sp.get("relatorio"));
        setTipo(t);
        setFiltro(filtroDoTipo(t, sp.get("data_inicio"), sp.get("data_fim")));
    }, []);

    useEffect(() => {
        if (tipo !== "prefeitura" && tipo !== "socio") return;
        apiJson(`${OS_API}?convenios_listar=1&_=${Date.now()}`).then((r) => setConvenios(r.dados || [])).catch(() => { });
    }, [tipo]);

    const opPrefeituras = useMemo(
        () => convenios.filter((c: any) => c.codigo && c.tipo === "PREFEITURA").map((c: any) => ({ v: String(c.codigo), r: `Prefeitura de ${c.nome}` })),
        [convenios],
    );
    const opPlanos = useMemo(
        () => convenios.filter((c: any) => c.codigo && c.tipo !== "PARTICULAR" && c.tipo !== "PREFEITURA").map((c: any) => ({ v: String(c.codigo), r: `Plano ${c.nome}` })),
        [convenios],
    );

    // Prestação de Contas é por Prefeitura: abre com a primeira da lista (dá para trocar ou tirar no filtro).
    useEffect(() => {
        if (tipo !== "prefeitura" || prefeituraPadrao.current || !opPrefeituras.length) return;
        prefeituraPadrao.current = true;
        setFiltro((f) => (f.convenios.length ? f : { ...f, convenios: [opPrefeituras[0].v] }));
    }, [tipo, opPrefeituras]);

    const carregar = useCallback(async () => {
        if (!tipo) return;
        if (tipo === "prefeitura" && !prefeituraPadrao.current && !filtro.convenios.length) return;   // espera a Prefeitura padrão
        setLoading(true);
        setErro("");
        try {
            const u = new URL(OS_API);
            u.searchParams.set("financeiro_relatorio", "1");
            Object.entries({ ...paramsDoFiltro(filtro), relatorio: tipo, formato: "json", _: String(Date.now()) }).forEach(([k, v]) => v && u.searchParams.set(k, String(v)));
            const r = await apiJson(u.toString());
            setRel(r.dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível gerar o relatório.");
            setRel(null);
        } finally {
            setLoading(false);
        }
    }, [filtro, tipo]);
    useEffect(() => { void carregar(); }, [carregar]);

    // Se a lista de convênios não vier (falha), a Prestação de Contas carrega com todas as Prefeituras.
    useEffect(() => {
        if (tipo !== "prefeitura") return;
        const t = setTimeout(() => {
            if (!prefeituraPadrao.current) {
                prefeituraPadrao.current = true;
                setFiltro((f) => ({ ...f }));
            }
        }, 4000);
        return () => clearTimeout(t);
    }, [tipo]);

    const linhas: any[] = rel?.linhas || [];
    // Pendências não tem "linhas": os agentes saem dos itens de cada grupo.
    const linhasAgentes = useMemo(() => (tipo === "pendencias" ? (rel?.grupos || []).flatMap((g: any) => g.itens || []) : rel?.linhas || []), [rel, tipo]);
    const opAgentes = useOpcoesAgente(linhasAgentes);

    /** Cálculo de Bônus ↔ Completo: troca na própria página, mantendo os filtros. */
    const trocarParticular = (t: TipoRelatorio) => {
        if (t === tipo) return;
        setRel(null);
        setTipo(t);
        window.history.replaceState(null, "", urlRelatorio(t, filtro.data_inicio, filtro.data_fim));
    };

    if (!tipo) {
        return <main data-os-tela className="min-h-screen bg-[#F4F6F9] dark:bg-[#161C2A]"><EstiloTemaOS /></main>;
    }

    const info = infoRelatorio(tipo);
    const periodo = `${dataBROS(filtro.data_inicio)} a ${dataBROS(filtro.data_fim)}`;
    const mostrar =
        tipo === "prefeitura" ? { convenio: opPrefeituras }
            : tipo === "socio" ? { convenio: opPlanos, agente: opAgentes }
            : tipo === "coroas" ? { agente: opAgentes }
            : tipo === "pendencias" ? { agente: opAgentes, semPeriodo: true }
                : { tipo: TIPOS_REL, situacao: SITUACOES_REL, agente: opAgentes };
    const g = rel?.total_geral || {};
    const chaveDe = (l: any, i: number) => l.os_id ?? `${l.numero_os}-${i}`;
    const abrirResumo = (ch: any) => {
        const l = linhas.find((x, i) => chaveDe(x, i) === ch);
        if (l?.os_id) prepararPdfDaOS(l.os_id);
        setResumo(l || null);
    };

    /* ---------------- conteúdo e impressão de cada relatório ---------------- */
    let conteudo: React.ReactNode = null;
    let doc: () => DocRelatorio = () => ({ titulo: nomeCompletoRelatorio(tipo), subtitulo: periodo, secoes: [], arquivo: `relatorio-${tipo}` });
    const arquivo = `relatorio-${tipo}-${filtro.data_inicio}-a-${filtro.data_fim}`;

    if (tipo === "bonus") {
        const porTipo = Object.entries(rel?.totais_por_tipo || {}) as [string, any][];
        const porAgente: any[] = rel?.por_agente || [];
        conteudo = (
            <>
                {rel && (
                    <CartoesOS itens={[
                        { rotulo: "Sem translado", valor: brl(g.valor_sem_translado), cor: "#313C55", sub: porTipo.length ? porTipo.map(([t, v]) => `${ROTULO[t] || t} ${brl(v.valor_sem_translado)}`).join(" · ") : `${g.quantidade || 0} OS` },
                        { rotulo: "Translado excluído", valor: brl(g.translado), cor: "#C9CFD9", sub: `total ${brl(g.valor_total)}` },
                    ]} />
                )}
                {rel && (
                    <BlocoRelatorio titulo="Por agente" direita="OS · Sem translado"
                        linhas={porAgente.map((a) => ({ rotulo: a.agente || "—", sub: `total ${brl(a.valor_total)}${a.translado > 0 ? ` · translado ${brl(a.translado)}` : ""}`, valor: `${a.quantidade} · ${brl(a.valor_sem_translado)}` }))} />
                )}
                <ListaCompactaOS
                    titulo={`${linhas.length} OS`} total={linhas.length ? "valor sem translado" : undefined} carregando={loading} vazio="Nenhuma OS no período com esses filtros."
                    linhas={linhas.map((l, i) => ({
                        chave: chaveDe(l, i), numero: l.numero_os, situacao: situacaoDaOS(l), valor: brl(l.valor_sem_translado), nome: l.falecido || "—",
                        meta: [l.tipo_rotulo, l.agente, dataL(l.data), l.translado > 0 ? `translado ${brl(l.translado)}` : ""].filter(Boolean).join(" · "),
                    }))}
                    onMais={abrirResumo}
                />
                {rel && linhas.length ? <div className="text-right text-lg font-black tabular-nums">Total sem translado: {brl(g.valor_sem_translado)}</div> : null}
            </>
        );
        doc = () => ({
            titulo: nomeCompletoRelatorio(tipo), subtitulo: `Particular, Dif e Coroa sem translado · ${periodo} · ${linhas.length} OS`, arquivo,
            resumo: [["OS no período", String(linhas.length)], ["Translado excluído", brl(g.translado), `total ${brl(g.valor_total)}`], ["Total sem translado", brl(g.valor_sem_translado)]],
            secoes: [
                {
                    titulo: "OS do período", numericas: [6, 7, 8],
                    cabecalho: ["OS", "Situação", "Tipo", "Data", "Falecido", "Agente", "Total", "Translado", "Sem translado"],
                    linhas: linhas.map((l) => [l.numero_os, situacaoDaOS(l).texto, l.tipo_rotulo, dataL(l.data), l.falecido || "—", l.agente || "—", brl(l.valor_total), l.translado > 0 ? brl(l.translado) : "—", brl(l.valor_sem_translado)]),
                    rodape: [`Total · ${linhas.length} OS`, "", "", "", "", "", brl(g.valor_total), brl(g.translado), brl(g.valor_sem_translado)],
                },
                {
                    titulo: "Por agente", numericas: [1, 2, 3, 4], largura: "640px",
                    cabecalho: ["Agente", "OS", "Total", "Translado", "Sem translado"],
                    linhas: porAgente.map((a) => [a.agente || "—", a.quantidade, brl(a.valor_total), a.translado > 0 ? brl(a.translado) : "—", brl(a.valor_sem_translado)]),
                    rodape: ["Total", linhas.length, brl(g.valor_total), brl(g.translado), brl(g.valor_sem_translado)],
                },
            ],
        });
    } else if (tipo === "completo") {
        const t = rel?.total_completo || {};
        const formas: any[] = rel?.por_forma || [];
        const porAgente: any[] = rel?.por_agente_completo || [];
        const maxForma = Math.max(1, ...formas.map((f) => Number(f.valor) || 0));
        const pagamentos = (l: any) => (l.pagamentos || []).map((p: any) => p.forma).join(" + ");
        conteudo = (
            <>
                {rel && (
                    <CartoesOS itens={[
                        { rotulo: "Valor bruto", valor: brl(t.bruto), cor: "#C9CFD9", sub: `${t.quantidade || 0} OS` },
                        { rotulo: "Descontos", valor: brl(-(t.desconto || 0)), cor: "#F2CB3F", sub: t.bruto > 0 ? `${((t.desconto / t.bruto) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do bruto` : undefined },
                        { rotulo: "Total", valor: brl(t.valor_total), cor: "#313C55", sub: `translado ${brl(t.translado)}` },
                        { rotulo: "Recebido", valor: brl(t.recebido), cor: "#B3CE52", sub: `a receber ${brl(t.a_receber)}` },
                    ]} />
                )}
                {rel && (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <BlocoRelatorio titulo="Por forma de pagamento" linhas={formas.map((f) => ({
                            rotulo: f.forma,
                            sub: <span className="mt-1 block h-1.5 w-40 max-w-full overflow-hidden rounded bg-[#E3E8F0] dark:bg-white/10"><span className="block h-1.5 rounded bg-[#3D6A99]" style={{ width: `${Math.round((Number(f.valor) / maxForma) * 100)}%` }} /></span>,
                            valor: brl(f.valor),
                        }))} />
                        <BlocoRelatorio titulo="Por agente" direita="Total · Recebido" linhas={porAgente.map((a) => ({
                            rotulo: a.agente || "—", sub: `${a.quantidade} OS${a.desconto > 0 ? ` · desc. ${brl(a.desconto)}` : ""}${a.a_receber > 0 ? ` · a receber ${brl(a.a_receber)}` : ""}`,
                            valor: `${brl(a.valor_total)} · ${brl(a.recebido)}`,
                        }))} />
                    </div>
                )}
                <ListaCompactaOS
                    titulo={`${linhas.length} OS`} total={linhas.length ? "total" : undefined} carregando={loading} vazio="Nenhuma OS no período com esses filtros."
                    linhas={linhas.map((l, i) => ({
                        chave: chaveDe(l, i), numero: l.numero_os, situacao: situacaoDaOS(l), valor: brl(l.valor_total), nome: l.falecido || "—",
                        meta: [l.agente, dataL(l.data), l.desconto > 0 ? `desc. ${brl(l.desconto)}` : "", l.translado > 0 ? `transl. ${brl(l.translado)}` : "", pagamentos(l), l.a_receber > 0 ? `falta ${brl(l.a_receber)}` : ""].filter(Boolean).join(" · "),
                        destaque: l.a_receber > 0,
                    }))}
                    onMais={abrirResumo}
                />
            </>
        );
        doc = () => ({
            titulo: nomeCompletoRelatorio(tipo), subtitulo: `Valores, descontos e recebimentos · ${periodo} · ${linhas.length} OS`, arquivo,
            resumo: [["Valor bruto", brl(t.bruto)], ["Descontos", brl(-(t.desconto || 0))], ["Total", brl(t.valor_total), `translado ${brl(t.translado)}`], ["Recebido", brl(t.recebido)], ["A receber", brl(t.a_receber)]],
            secoes: [
                {
                    titulo: "OS do período", numericas: [4, 5, 6, 7, 8, 9],
                    cabecalho: ["OS", "Data", "Falecido", "Agente", "Bruto", "Desconto", "Translado", "Total", "Recebido", "A receber", "Pagamento"],
                    linhas: linhas.map((l) => [l.numero_os, dataL(l.data), l.falecido || "—", l.agente || "—", brl(l.bruto), l.desconto > 0 ? brl(-l.desconto) : "—", l.translado > 0 ? brl(l.translado) : "—", brl(l.valor_total), brl(l.recebido), l.a_receber > 0 ? brl(l.a_receber) : "—", pagamentos(l) || "—"]),
                    rodape: ["Total", "", "", "", brl(t.bruto), brl(-(t.desconto || 0)), brl(t.translado), brl(t.valor_total), brl(t.recebido), brl(t.a_receber), ""],
                },
                { titulo: "Por forma de pagamento", numericas: [1], largura: "420px", cabecalho: ["Forma", "Valor"], linhas: formas.map((f) => [f.forma, brl(f.valor)]), rodape: ["Recebido", brl(t.recebido)] },
                {
                    titulo: "Por agente", numericas: [1, 2, 3, 4, 5, 6], largura: "820px",
                    cabecalho: ["Agente", "OS", "Bruto", "Desconto", "Total", "Recebido", "A receber"],
                    linhas: porAgente.map((a) => [a.agente || "—", a.quantidade, brl(a.bruto), a.desconto > 0 ? brl(-a.desconto) : "—", brl(a.valor_total), brl(a.recebido), a.a_receber > 0 ? brl(a.a_receber) : "—"]),
                },
            ],
        });
    } else if (tipo === "prefeitura") {
        const servicos: any[] = rel?.resumo_servicos || [];
        const translados: any[] = rel?.translados || [];
        const nomes: string[] = rel?.convenios || [];
        const nomeConv = nomes.length === 1 ? nomes[0] : nomes.length ? nomes.join(", ") : "Prefeituras";
        const coroasTxt = (l: any) => (l.coroas || []).map((c: any) => (c.quantidade > 1 ? `${c.quantidade}× ${c.nome}` : c.nome)).join(" + ");
        conteudo = (
            <>
                <AbasRelatorio opcoes={[["resumo", "Resumo"], ["atendimentos", "Atendimentos"], ["translados", "Translados"]]} valor={aba} onTrocar={setAba} />
                {rel && (
                    <CartoesOS itens={[
                        { rotulo: "Total do período", valor: brl(g.valor_total), cor: "#313C55", sub: `${g.quantidade || 0} OS · ${g.atendimentos || 0} atendimentos` },
                        { rotulo: "Serviços funerários", valor: brl(g.servico), cor: "#3D6A99", sub: `${g.atendimentos || 0} atendimentos` },
                        { rotulo: "Tanatopraxia", valor: brl(g.tanatopraxia), cor: "#00AEEC", sub: `${g.tanatos || 0}` },
                        { rotulo: "Translado", valor: brl(g.translado), cor: "#B3CE52", sub: `${g.translados || 0} · ${km(g.translado_km)} km` },
                        { rotulo: "Coroas", valor: brl(g.coroa), cor: "#F2CB3F", sub: `${g.coroas || 0}` },
                    ]} />
                )}
                {aba === "resumo" && rel ? (
                    <BlocoRelatorio titulo="Resumo por serviço" direita="Qtd · Total" linhas={servicos.map((s) => ({
                        rotulo: `${s.item}. ${s.descricao}`, sub: `${brl(s.valor_unitario)}${s.unidade === "KM" ? " por km" : ""}`,
                        valor: `${s.unidade === "KM" ? `${km(s.quantidade)} km` : s.quantidade} · ${brl(s.total)}`,
                    }))} />
                ) : null}
                {aba === "atendimentos" ? (
                    <ListaCompactaOS
                        titulo={`${linhas.length} OS`} total={linhas.length ? "total" : undefined} carregando={loading} vazio="Nenhuma OS da Prefeitura no período."
                        linhas={linhas.map((l, i) => ({
                            chave: chaveDe(l, i), numero: l.numero_os, situacao: situacaoDaOS(l), valor: brl(l.valor_total), nome: l.falecido || (l.tipo_os === "COROA" ? "Coroa autorizada" : "—"),
                            meta: [l.servico, l.tanatopraxia > 0 ? "tanatopraxia" : "", l.translado_km > 0 ? `${km(l.translado_km)} km` : "", coroasTxt(l), dataL(l.data)].filter(Boolean).join(" · "),
                        }))}
                        onMais={abrirResumo}
                    />
                ) : null}
                {aba === "translados" ? (
                    <ListaCompactaOS
                        titulo={`${translados.length} translados · ${km(g.translado_km)} km`} total={translados.length ? brl(g.translado) : undefined} carregando={loading} vazio="Nenhum translado no período."
                        linhas={translados.map((t2, i) => ({
                            chave: `${t2.os_id}-${i}`, numero: t2.numero_os, situacao: situacaoDaOS(linhas.find((l) => l.os_id === t2.os_id) || {}), valor: brl(t2.valor), nome: t2.falecido || "—",
                            meta: `${t2.origem} → ${t2.destino} · ${km(t2.km)} km × ${brl(t2.valor_km)} · ${dataL(t2.data)}`,
                        }))}
                        onMais={(ch) => abrirResumo(Number(String(ch).split("-")[0]))}
                    />
                ) : null}
            </>
        );
        doc = () => ({
            titulo: nomeCompletoRelatorio(tipo), subtitulo: `${nomeConv} · ${periodo}`, arquivo,
            resumo: [["Total do período", brl(g.valor_total), `${g.quantidade || 0} OS`], ["Serviços funerários", brl(g.servico), `${g.atendimentos || 0} atendimentos`],
                ["Tanatopraxia", brl(g.tanatopraxia), String(g.tanatos || 0)], ["Translado", brl(g.translado), `${g.translados || 0} · ${km(g.translado_km)} km`], ["Coroas", brl(g.coroa), String(g.coroas || 0)]],
            secoes: [
                {
                    titulo: "Resumo por serviço", numericas: [0, 3, 4, 5],
                    cabecalho: ["Item", "Descrição", "Unid", "Quantidade", "Valor unitário", "Total"],
                    linhas: servicos.map((s) => [s.item, s.descricao, s.unidade, s.unidade === "KM" ? km(s.quantidade) : s.quantidade, brl(s.valor_unitario), brl(s.total)]),
                    rodape: ["", "Total do período", "", "", "", brl(g.valor_total)],
                },
                {
                    titulo: "Relação de atendimentos", novaFolha: true, numericas: [4, 5, 6, 7, 9, 10],
                    cabecalho: ["OS", "Data", "Falecido", "Serviço", "Serviço", "Tanatopraxia", "Km", "Translado", "Coroa", "Coroa", "Total"],
                    linhas: linhas.map((l) => [l.numero_os, dataL(l.data), l.falecido || (l.tipo_os === "COROA" ? "Coroa autorizada" : "—"), l.servico || "—", l.valor_servico > 0 ? brl(l.valor_servico) : "—",
                        l.tanatopraxia > 0 ? brl(l.tanatopraxia) : "—", l.translado_km > 0 ? km(l.translado_km) : "—", l.translado > 0 ? brl(l.translado) : "—", coroasTxt(l) || "—", l.valor_coroas > 0 ? brl(l.valor_coroas) : "—", brl(l.valor_total)]),
                    rodape: [`Total · ${linhas.length} OS`, "", "", "", brl(g.servico), brl(g.tanatopraxia), km(g.translado_km), brl(g.translado), "", brl(g.coroa), brl(g.valor_total)],
                },
                {
                    titulo: "Relação de translados", novaFolha: true, numericas: [5, 6, 7],
                    cabecalho: ["OS", "Data", "Falecido", "Origem", "Destino", "Km", "Valor do km", "Valor"],
                    linhas: translados.map((t2) => [t2.numero_os, dataL(t2.data), t2.falecido || "—", t2.origem || "—", t2.destino || "—", km(t2.km), brl(t2.valor_km), brl(t2.valor)]),
                    rodape: [`Total · ${translados.length} translados`, "", "", "", "", km(g.translado_km), "", brl(g.translado)],
                },
            ],
            assinaturas: ["PAI — Plano Assistencial Integrado", nomes.length === 1 ? nomes[0].replace(/^Prefeitura de /, "Prefeitura Municipal de ") : "Prefeitura Municipal"],
        });
    } else if (tipo === "coroas") {
        const origens: any[] = rel?.por_origem || [];
        const modelos: any[] = rel?.por_modelo || [];
        const semanas: any[] = rel?.por_semana || [];
        const maxO = Math.max(1, ...origens.map((o) => o.quantidade));
        const maxM = Math.max(1, ...modelos.map((m) => m.quantidade));
        const barra = (v: number, m: number) => <span className="mt-1 block h-1.5 w-40 max-w-full overflow-hidden rounded bg-[#E3E8F0] dark:bg-white/10"><span className="block h-1.5 rounded bg-[#3D6A99]" style={{ width: `${Math.round((v / m) * 100)}%` }} /></span>;
        const natArt = (o: any) => [o.naturais ? `${o.naturais} natural${o.naturais > 1 ? "is" : ""}` : "", o.artificiais ? `${o.artificiais} artificia${o.artificiais > 1 ? "is" : "l"}` : ""].filter(Boolean).join(" · ");
        const cobrado = (l: any) => (l.valor === null || l.valor === undefined ? l.paga : brl(l.valor));
        conteudo = (
            <>
                <AbasRelatorio opcoes={[["resumo", "Resumo"], ["atendimentos", "Coroas"]]} valor={aba === "translados" ? "resumo" : aba} onTrocar={setAba} />
                {rel && (
                    <CartoesOS itens={[
                        { rotulo: "Coroas", valor: String(g.quantidade || 0), cor: "#313C55", sub: natArt({ naturais: g.naturais, artificiais: g.artificiais }) || "nenhuma" },
                        { rotulo: "Cobrado", valor: brl(g.cobrado), cor: "#B3CE52", sub: `família ${brl(g.cobrado_familia)}` },
                        { rotulo: "Custo dos itens", valor: brl(g.custo), cor: "#00AEEC", sub: g.sem_custo ? `${g.sem_custo} sem custo (naturais)` : g.cobrado > 0 ? `${Math.round((g.custo / g.cobrado) * 100)}% do cobrado` : undefined },
                        { rotulo: "Pelo plano", valor: String(g.plano || 0), cor: "#3D6A99", sub: `custo ${brl(g.custo_plano)}` },
                    ]} />
                )}
                {aba !== "atendimentos" && rel ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <BlocoRelatorio titulo="Por origem" direita="Qtd · Cobrado" linhas={origens.map((o) => ({
                            rotulo: o.origem, sub: <>{[o.paga, natArt(o), o.custo > 0 ? `custo ${brl(o.custo)}` : ""].filter(Boolean).join(" · ")}{barra(o.quantidade, maxO)}</>,
                            valor: `${o.quantidade} · ${o.cobrado > 0 ? brl(o.cobrado) : "coberta"}`,
                        }))} />
                        <div className="flex flex-col gap-3">
                            <BlocoRelatorio titulo="Por modelo" direita="Qtd" linhas={modelos.map((m) => ({
                                rotulo: m.modelo, sub: <>{m.tipo}{m.custo_medio !== null ? ` · custo médio ${brl(m.custo_medio)}` : ""}{barra(m.quantidade, maxM)}</>, valor: m.quantidade,
                            }))} />
                            <BlocoRelatorio titulo="Por semana" direita="Naturais · Artificiais" linhas={semanas.map((w) => ({
                                rotulo: `${dataL(w.inicio)} a ${dataL(w.fim)}`, valor: `${w.naturais} · ${w.artificiais}`,
                            }))} />
                        </div>
                    </div>
                ) : null}
                {aba === "atendimentos" ? (
                    <ListaCompactaOS
                        titulo={`${linhas.length} coroas`} total={linhas.length ? "cobrado" : undefined} carregando={loading} vazio="Nenhuma coroa no período."
                        linhas={linhas.map((l, i) => ({
                            chave: `${l.os_id}-${i}`, numero: l.numero_os, situacao: situacaoDaOS(l), valor: cobrado(l), nome: l.falecido || "—",
                            meta: [l.origem, `${l.tipo} ${l.modelo}`, l.faixa ? `“${l.faixa}”` : "", l.agente, dataL(l.data), l.custo !== null ? `custo ${brl(l.custo)}` : ""].filter(Boolean).join(" · "),
                        }))}
                        onMais={(ch) => abrirResumo(Number(String(ch).split("-")[0]))}
                    />
                ) : null}
            </>
        );
        doc = () => ({
            titulo: nomeCompletoRelatorio(tipo), subtitulo: `Todas as coroas do período · ${periodo}`, arquivo,
            resumo: [["Coroas", String(g.quantidade || 0), natArt({ naturais: g.naturais, artificiais: g.artificiais })], ["Cobrado da família", brl(g.cobrado_familia)],
                ["Cobrado da Prefeitura", brl(g.cobrado_prefeitura)], ["Cobertas pelo plano", String(g.plano || 0), `custo ${brl(g.custo_plano)}`],
                ["Custo dos itens", brl(g.custo), g.sem_custo ? `${g.sem_custo} sem custo (naturais)` : ""]],
            secoes: [
                {
                    titulo: "Por origem", numericas: [2, 3, 4, 5, 6],
                    cabecalho: ["Origem", "Quem paga", "Qtd", "Natural", "Artificial", "Cobrado", "Custo"],
                    linhas: origens.map((o) => [o.origem, o.paga, o.quantidade, o.naturais || "—", o.artificiais || "—", o.cobrado > 0 ? brl(o.cobrado) : "—", o.custo > 0 ? brl(o.custo) : "—"]),
                    rodape: ["Total", "", g.quantidade || 0, g.naturais || 0, g.artificiais || 0, brl(g.cobrado), brl(g.custo)],
                },
                {
                    titulo: "Por modelo", numericas: [2, 3, 4], largura: "760px",
                    cabecalho: ["Modelo", "Tipo", "Qtd", "Custo médio", "Custo total"],
                    linhas: modelos.map((m) => [m.modelo, m.tipo, m.quantidade, m.custo_medio !== null ? brl(m.custo_medio) : "—", m.custo > 0 ? brl(m.custo) : "—"]),
                },
                { titulo: "Por semana", numericas: [1, 2], largura: "480px", cabecalho: ["Semana", "Naturais", "Artificiais"], linhas: semanas.map((w) => [`${dataL(w.inicio)} a ${dataL(w.fim)}`, w.naturais, w.artificiais]) },
                {
                    titulo: "Relação das coroas", novaFolha: true, numericas: [8, 9],
                    cabecalho: ["OS", "Data", "Falecido", "Origem", "Tipo", "Modelo", "Frase da faixa", "Agente", "Cobrado", "Custo"],
                    linhas: linhas.map((l) => [l.numero_os, dataL(l.data), l.falecido || "—", l.origem, l.tipo, l.modelo, l.faixa || "—", l.agente || "—", cobrado(l), l.custo !== null ? brl(l.custo) : "—"]),
                    rodape: [`Total · ${g.quantidade || 0} coroas`, "", "", "", "", "", "", "", brl(g.cobrado), brl(g.custo)],
                },
            ],
        });
    } else if (tipo === "pendencias") {
        const abrirPend = (osId: number) => {
            const it = (rel?.grupos || []).flatMap((x: any) => x.itens || []).find((x: any) => x.os_id === osId);
            if (!it) return;
            prepararPdfDaOS(osId);
            setResumo({ ...it, data: it.desde });
        };
        conteudo = (
            <>
                <AbasRelatorio opcoes={[["tipo", "Por tipo"], ["agente", "Por agente"]]} valor={vistaPend} onTrocar={setVistaPend} />
                <PendenciasOS dados={rel} carregando={loading} vista={vistaPend} onAbrir={(id) => abrirPend(id)} />
            </>
        );
        doc = () => docPendencias(rel, true);
    } else {
        const porPlano: any[] = rel?.por_plano || [];
        const cobertos: any[] = rel?.itens_cobertos || [];
        const custoTxt = (l: any) => (l.custo === null || l.custo === undefined ? "sem custo" : `custo ${brl(l.custo)}`);
        conteudo = (
            <>
                <AbasRelatorio opcoes={[["resumo", "Resumo"], ["atendimentos", "Atendimentos"]]} valor={aba === "translados" ? "resumo" : aba} onTrocar={setAba} />
                {rel && (
                    <CartoesOS itens={[
                        { rotulo: "Coberto pelo plano", valor: brl(g.coberto), cor: "#3D6A99", sub: `${g.quantidade || 0} atendimentos` },
                        { rotulo: "Custo dos itens", valor: brl(g.custo), cor: "#00AEEC", sub: g.coberto > 0 ? `${Math.round((g.custo / g.coberto) * 100)}% do coberto` : undefined },
                        { rotulo: "Dif. cobrada", valor: brl(g.diferenca), cor: "#F2CB3F", sub: `${linhas.filter((l) => l.diferenca > 0).length} famílias` },
                        { rotulo: "Por plano", valor: porPlano.map((p) => p.quantidade).join(" · ") || "0", cor: "#B3CE52", sub: porPlano.map((p) => p.plano).join(" · ") },
                    ]} />
                )}
                {aba !== "atendimentos" && rel ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <BlocoRelatorio titulo="Por plano" direita="Coberto · Custo" linhas={porPlano.map((p) => ({
                            rotulo: p.plano, sub: `${p.quantidade} atendimentos${p.diferenca > 0 ? ` · Dif ${brl(p.diferenca)}` : ""}`, valor: `${brl(p.coberto)} · ${brl(p.custo)}`,
                        }))} />
                        <BlocoRelatorio titulo="Itens cobertos" direita="Qtd" linhas={cobertos.map((c) => ({ rotulo: c.categoria, valor: c.quantidade }))} />
                    </div>
                ) : null}
                {aba === "atendimentos" ? (
                    <ListaCompactaOS
                        titulo={`${linhas.length} atendimentos`} total={linhas.length ? "coberto pelo plano" : undefined} carregando={loading} vazio="Nenhum atendimento de sócio no período."
                        linhas={linhas.map((l, i) => ({
                            chave: chaveDe(l, i), numero: l.numero_os, situacao: situacaoDaOS(l), valor: brl(l.coberto), nome: l.falecido || "—",
                            meta: [l.plano, l.contrato ? `contrato ${l.contrato}` : "", l.agente, dataL(l.data), custoTxt(l), l.diferenca > 0 ? `Dif ${brl(l.diferenca)}` : "", ...(l.aditivos || [])].filter(Boolean).join(" · "),
                        }))}
                        onMais={abrirResumo}
                    />
                ) : null}
            </>
        );
        doc = () => ({
            titulo: nomeCompletoRelatorio(tipo), subtitulo: `Atendimentos de associados · ${periodo}`, arquivo,
            resumo: [["Atendimentos", String(g.quantidade || 0), porPlano.map((p) => `${p.plano} ${p.quantidade}`).join(" · ")], ["Coberto pelo plano", brl(g.coberto)], ["Custo dos itens", brl(g.custo)], ["Dif. cobrada da família", brl(g.diferenca)]],
            secoes: [
                {
                    titulo: "Atendimentos", numericas: [7, 8, 9],
                    cabecalho: ["OS", "Data", "Falecido", "Plano", "Contrato", "Agente", "Aditivo", "Coberto", "Custo dos itens", "Dif. família"],
                    linhas: linhas.map((l) => [l.numero_os, dataL(l.data), l.falecido || "—", l.plano, l.contrato || "—", l.agente || "—", (l.aditivos || []).join(", ") || "—", brl(l.coberto), l.custo === null ? "—" : brl(l.custo), l.diferenca > 0 ? brl(l.diferenca) : "—"]),
                    rodape: [`Total · ${linhas.length} atendimentos`, "", "", "", "", "", "", brl(g.coberto), brl(g.custo), brl(g.diferenca)],
                },
                { titulo: "Por plano", numericas: [1, 2, 3, 4], largura: "640px", cabecalho: ["Plano", "Atend.", "Coberto", "Custo", "Dif."], linhas: porPlano.map((p) => [p.plano, p.quantidade, brl(p.coberto), brl(p.custo), p.diferenca > 0 ? brl(p.diferenca) : "—"]) },
                { titulo: "Itens cobertos", numericas: [1], largura: "420px", cabecalho: ["Item", "Quantidade"], linhas: cobertos.map((c) => [c.categoria, c.quantidade]) },
            ],
        });
    }

    /* ---------------- resumo da OS (⋮) ---------------- */
    const camposResumo = (r: any): [string, React.ReactNode, boolean?][] => {
        const base: [string, React.ReactNode, boolean?][] = [["Falecido", r.falecido || "—"], ["Agente", r.agente || "—"], ["Data", dataL(r.data)]];
        if (tipo === "bonus") return [...base, ["Total", brl(r.valor_total)], ["Translado", r.translado > 0 ? `− ${brl(r.translado)}` : "—"], ["Sem translado", brl(r.valor_sem_translado), true]];
        if (tipo === "completo") return [...base, ["Bruto", brl(r.bruto)], ["Desconto", r.desconto > 0 ? brl(-r.desconto) : "—"], ["Total", brl(r.valor_total), true], ["Recebido", brl(r.recebido)], ["A receber", brl(r.a_receber)], ["Pagamento", (r.pagamentos || []).map((p: any) => `${p.forma} ${brl(p.valor)}`).join(" + ") || "—"]];
        if (tipo === "coroas") return [...base, ["Origem", r.origem], ["Coroa", `${r.tipo} · ${r.modelo}`], ["Frase da faixa", r.faixa || "—"], ["Cobrado", r.valor === null ? r.paga : brl(r.valor), true], ["Custo", r.custo === null ? "—" : brl(r.custo)]];
        if (tipo === "pendencias") return [["Falecido", r.falecido || "—"], ["Agente", r.agente || "—"], ["Situação", r.detalhe], ["Valor", brl(r.valor), true], ["Parada há", situacaoDiasTexto(r.dias)]];
        if (tipo === "prefeitura") return [...base, ["Serviço", r.servico ? `${r.servico} · ${brl(r.valor_servico)}` : "—"], ["Tanatopraxia", r.tanatopraxia > 0 ? brl(r.tanatopraxia) : "—"], ["Translado", r.translado > 0 ? `${km(r.translado_km)} km · ${brl(r.translado)}` : "—"], ["Coroa", r.valor_coroas > 0 ? brl(r.valor_coroas) : "—"], ["Total", brl(r.valor_total), true]];
        return [...base, ["Plano", r.plano], ["Contrato", r.contrato || "—"], ["Aditivo", (r.aditivos || []).join(", ") || "—"], ["Coberto pelo plano", brl(r.coberto), true], ["Custo dos itens", r.custo === null ? "—" : brl(r.custo)], ["Dif. família", r.diferenca > 0 ? brl(r.diferenca) : "—"]];
    };

    return (
        <main data-os-tela className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <EstiloTemaOS />
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <div className="min-w-0">
                    <h1 className="truncate text-[22px] font-black leading-tight sm:text-[26px]">{info.nome}</h1>
                    {info.secao ? <div className="truncate text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">{info.secao}</div> : null}
                </div>
                <BarraFiltrosOS
                    filtro={filtro}
                    mostrar={mostrar}
                    onAbrirFiltros={() => setJanelaFiltros(true)}
                    onMudar={setFiltro}
                    exportar={rel ? itensExportarRelatorio(doc) : undefined}
                    extra={
                        <>
                            <button type="button" className={BOTAO} onClick={() => setJanelaRel(true)}>
                                <Icone d={<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />} />
                                <span className="hidden sm:inline">Relatórios</span>
                            </button>
                            <a href="/os/financeiro" className={`${BOTAO} hidden sm:inline-flex`}>Financeiro</a>
                        </>
                    }
                />
                {tipo === "bonus" || tipo === "completo" ? (
                    <AbasRelatorio opcoes={[["bonus", "Cálculo de Bônus"], ["completo", "Completo"]]} valor={tipo} onTrocar={trocarParticular} />
                ) : null}

                {erro && <div className="rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {aviso && <div className="rounded-lg border border-[#E3E8F0] bg-white p-3 text-sm font-semibold dark:border-white/[0.12] dark:bg-[#232B3F]">{aviso}</div>}

                {conteudo}
            </div>

            {janelaFiltros && (
                <JanelaFiltrosOS valor={filtro} mostrar={mostrar} onFechar={() => setJanelaFiltros(false)} onAplicar={(f) => (setFiltro(f), setJanelaFiltros(false))} />
            )}
            {janelaRel && <JanelaRelatorios filtro={filtro} atual={tipo} onFechar={() => setJanelaRel(false)} />}

            {resumo && (
                <ResumoOS
                    numero={resumo.numero_os}
                    situacao={situacaoDaOS(resumo)}
                    subtitulo={resumo.tipo_rotulo || (tipo === "socio" ? `Plano ${resumo.plano}` : undefined)}
                    onFechar={() => setResumo(null)}
                    campos={camposResumo(resumo)}
                    acoes={
                        resumo.os_id
                            ? [
                                { rotulo: "PDF", icone: <Icone d={Ic.pdf} tam={18} />, onClick: () => void baixarPdfDaOS(resumo.os_id, resumo.numero_os).then((m) => m && setAviso(m)) },
                                { rotulo: "Imprimir", icone: <Icone d={Ic.imprimir} tam={18} />, onClick: () => window.open(`${OS_API}?documento_os=1&os_id=${resumo.os_id}&formato=impressao`, "_blank") },
                            ]
                            : []
                    }
                />
            )}
        </main>
    );
}
