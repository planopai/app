"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    BarraFiltrosOS, CartoesOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, filtroInicial, itensExportar, paramsDoFiltro, situacaoDaOS, type FiltroOS, type TabelaExport,
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
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPOS_REL = TIPOS_OS.filter((t) => ["PRT", "DIF_SOC", "DIF_PRF", "COR"].includes(t.v));
/* Relatório: sem situação escolhida vêm só as assinadas (como antes). Com situação, as escolhidas (ex.: também as abertas). */
const SITUACOES_REL = SITUACOES_OS.filter((s) => s.v !== "CONVERTIDA");
const ROTULO: Record<string, string> = { PRT: "Particular", DIF_SOC: "Dif — Associado", DIF_PRF: "Dif — Prefeitura", COR: "Coroa" };

export default function RelatorioAtendimentosPage() {
    /* Padrão de 08/10/2026: filtros no botão Filtros, Exportar (imprimir, PDF, planilha) e lista que cabe na tela. */
    const [filtro, setFiltro] = useState<FiltroOS>(() => filtroInicial({ situacoes: ["FECHADA", "ABERTA", "AGUARDANDO_ASSINATURA"] }));
    const [janelaFiltros, setJanelaFiltros] = useState(false);
    const [rel, setRel] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [resumo, setResumo] = useState<any>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");
        try {
            const u = new URL(OS_API);
            u.searchParams.set("financeiro_relatorio", "1");
            Object.entries({ ...paramsDoFiltro(filtro), formato: "json", _: String(Date.now()) }).forEach(([k, v]) => v && u.searchParams.set(k, String(v)));
            const r = await apiJson(u.toString());
            setRel(r.dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível gerar o relatório.");
        } finally {
            setLoading(false);
        }
    }, [filtro]);
    useEffect(() => { void carregar(); }, [carregar]);

    const g = rel?.total_geral;
    const linhas: any[] = rel?.linhas || [];
    const mostrar = { tipo: TIPOS_REL, situacao: SITUACOES_REL };
    const dataL = (d: string) => (d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "—");
    const tabela = (): TabelaExport => ({
        titulo: "Relatório de OS — Particular, Dif e Coroa (sem translado)",
        subtitulo: `${dataBROS(filtro.data_inicio)} a ${dataBROS(filtro.data_fim)} · ${linhas.length} OS`,
        cabecalho: ["OS", "Situação", "Tipo", "Data", "Falecido", "Agente", "Total", "Translado", "Sem translado"],
        linhas: linhas.map((l) => [l.numero_os, situacaoDaOS(l).texto, l.tipo_rotulo, dataL(l.data), l.falecido || "—", l.agente || "—", brl(l.valor_total), l.translado > 0 ? `− ${brl(l.translado)}` : "—", brl(l.valor_sem_translado)]),
        rodape: `Total sem translado: ${brl(g?.valor_sem_translado)}`,
        arquivo: `relatorio-os-${filtro.data_inicio}-a-${filtro.data_fim}`,
    });
    const porTipo = Object.entries(rel?.totais_por_tipo || {}) as [string, any][];

    return (
        <main className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <BarraFiltrosOS
                    filtro={filtro}
                    mostrar={mostrar}
                    onAbrirFiltros={() => setJanelaFiltros(true)}
                    onMudar={setFiltro}
                    exportar={itensExportar(tabela)}
                    extra={<a href="/os/financeiro" className="inline-flex h-11 items-center rounded-xl border-[1.5px] border-[#C9D1DE] px-3.5 text-[15px] font-bold dark:border-white/25">Financeiro</a>}
                />

                {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {aviso && <div className="rounded-lg border border-[#E3E8F0] bg-white p-3 text-sm font-semibold dark:border-white/[0.12] dark:bg-[#232B3F]">{aviso}</div>}

                {rel && (
                    <CartoesOS
                        itens={[
                            { rotulo: "Sem translado", valor: brl(g?.valor_sem_translado), cor: "#313C55", sub: porTipo.length ? porTipo.map(([t, v]) => `${ROTULO[t] || t} ${brl(v.valor_sem_translado)}`).join(" · ") : `${g?.quantidade || 0} OS` },
                            { rotulo: "Translado excluído", valor: brl(g?.translado), cor: "#C9CFD9", sub: `total ${brl(g?.valor_total)}` },
                        ]}
                    />
                )}

                <ListaCompactaOS
                    titulo={`${linhas.length} OS`}
                    total={linhas.length ? "valor sem translado" : undefined}
                    carregando={loading}
                    vazio="Nenhuma OS no período com esses filtros."
                    linhas={linhas.map((l, i) => ({
                        chave: l.os_id ?? `${l.numero_os}-${i}`,
                        numero: l.numero_os,
                        situacao: situacaoDaOS(l),
                        valor: brl(l.valor_sem_translado),
                        nome: l.falecido || "—",
                        meta: [l.tipo_rotulo, l.agente, dataL(l.data)].filter(Boolean).join(" · "),
                    }))}
                    onMais={(ch) => setResumo(linhas.find((l, i) => (l.os_id ?? `${l.numero_os}-${i}`) === ch))}
                />
                {rel && linhas.length ? (
                    <div className="text-right text-lg font-black tabular-nums">Total sem translado: {brl(g?.valor_sem_translado)}</div>
                ) : null}
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
                        ["Agente", resumo.agente || "—"],
                        ["Data", dataL(resumo.data)],
                        ["Total", brl(resumo.valor_total)],
                        ["Translado", resumo.translado > 0 ? `− ${brl(resumo.translado)}` : "—"],
                        ["Sem translado", brl(resumo.valor_sem_translado), true],
                    ]}
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
