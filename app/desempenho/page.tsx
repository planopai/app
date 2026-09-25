"use client";

/*
 * PAINEL DE ATENDIMENTOS — restrito à gerência
 *
 * Dados: https://api.planoassistencialintegrado.com.br/painel_atendimentos.php (cálculos feitos no servidor).
 * Histórico da ficha: https://api.planoassistencialintegrado.com.br/historico_sepultamentos.php?log=1&id=...
 * Visual: mesmas variáveis --dash-* e fonte Nunito do Dashboard de desempenho.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Nunito } from "next/font/google";

const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"] });

const API_BASE_URL = "https://api.planoassistencialintegrado.com.br";
const PAINEL_URL = `${API_BASE_URL}/painel_atendimentos.php`;
const HISTORICO_URL = `${API_BASE_URL}/historico_sepultamentos.php?log=1&id=`;

/* =========================================================
   TIPOS (resposta do painel_atendimentos.php)
========================================================= */

type Contagem = { nome: string; total: number };
type EtapaResumo = { chave: string; rotulo: string; tipo: "execucao" | "espera"; n: number; mediana_h: number | null; media_h: number | null; p90_h: number | null };
type MatrizLinha = { agente: string; etapas: Record<string, { n: number; horas: number; mediana_h: number | null }>; total_n: number; total_h: number };
type Pontual = { n: number; no_horario_pct: number; atraso_mediana_min: number | null };
type ListaItem = {
    id: number; falecido: string; criado_em: string; data_falecimento: string | null; data_sepultamento: string | null;
    idade: number | null; convenio: string; agente: string; velorio: string; local_velorio: string | null; cemiterio: string;
    urna: string; roupa: string | null; religiao: string; status: string; status_rotulo: string; no_quadro: boolean;
    ciclo_h: number | null; ocioso_h: number | null; etapas: Record<string, { h: number; quem: string }>;
};
type Painel = {
    ok: boolean; need_login?: number; sem_permissao?: number; msg?: string; gerado_em: string;
    periodo: { inicio: string; fim: string; ref: string; dias: number; anterior: { inicio: string; fim: string; total: number } };
    resumo: {
        total: number; anterior: number; variacao_pct: number | null; media_dia: number; pico: { data: string; total: number } | null;
        idade_media: number | null; idade_n: number; ciclo_mediana_h: number | null; ciclo_p90_h: number | null; ciclo_n: number;
        em_andamento_periodo: number; com_historico: number;
    };
    serie: { granularidade: "dia" | "semana" | "mes"; pontos: { chave: string; rotulo: string; total: number; por_convenio: Record<string, number> }[] };
    convenios: Contagem[]; heatmap: number[][]; dia_semana: { dia: string; total: number; dias: number; media: number }[];
    velorio: Contagem[]; cemiterio: Contagem[];
    equipe: {
        etapas: EtapaResumo[]; ocioso: { n: number; mediana_h: number | null; p90_h: number | null };
        matriz: MatrizLinha[]; meses: string[]; mensal: { agente: string; meses: Record<string, number> }[];
        pontualidade: { velorio: Pontual & { por_agente: (Pontual & { agente: string })[] }; sepultamento: Pontual & { por_agente: (Pontual & { agente: string })[] } };
        registro_lote: { agente: string; trocas: number; em_lote: number; pct: number }[];
        evidencias: { agente: string; ornamentacao: { n: number; com_foto: number; pct: number }; entrega: { n: number; com_foto: number; pct: number } }[];
        titulares: Contagem[];
    };
    perfil: {
        servicos: { nome: string; total: number; pct: number }[]; urnas: Contagem[]; roupas: Contagem[]; religiao: Contagem[];
        faixas_etarias: Contagem[]; qualidade: { campo: string; total: number; pct: number }[];
        qualidade_agente: { agente: string; pct: number; n: number }[]; status: { status: string; rotulo: string; total: number }[];
    };
    lista: ListaItem[];
    etapas_definicao: { chave: string; rotulo: string; inicio: string; fim: string; credito: string; tipo: "execucao" | "espera" }[];
    em_andamento: { id: number; falecido: string; status: string; status_rotulo: string; convenio: string; velorio: string; horas_desde_cadastro: number | null }[];
    opcoes: { convenios: string[]; agentes: string[] };
};

/* =========================================================
   HELPERS
========================================================= */

const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dataBR = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const dataHoraBR = (s?: string | null) => (s ? `${dataBR(s)}${s.length > 10 ? " " + s.slice(11, 16) : ""}` : "—");
const fmtN = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const fmtP = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`);
function fmtH(h: number | null | undefined) {
    if (h == null) return "—";
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
    return `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesRotulo = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

type Preset = "hoje" | "7d" | "30d" | "mes" | "mesant" | "90d" | "ano" | "custom";
const PRESETS: [Preset, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["mesant", "Mês anterior"], ["90d", "90 dias"], ["ano", "Este ano"]];
function rangeDe(p: Preset): { inicio: string; fim: string } {
    const h = new Date();
    switch (p) {
        case "hoje": return { inicio: iso(h), fim: iso(h) };
        case "7d": return { inicio: iso(addDias(h, -6)), fim: iso(h) };
        case "30d": return { inicio: iso(addDias(h, -29)), fim: iso(h) };
        case "90d": return { inicio: iso(addDias(h, -89)), fim: iso(h) };
        case "mes": return { inicio: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
        case "mesant": return { inicio: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
        case "ano": return { inicio: `${h.getFullYear()}-01-01`, fim: iso(h) };
        default: return { inicio: iso(addDias(h, -29)), fim: iso(h) };
    }
}

const CONV_COR: Record<string, string> = {
    "Prefeitura de Barreiras": "var(--dash-blue)",
    Particular: "var(--dash-yellow)",
    "Associado(a)": "var(--dash-teal)",
    "Prefeitura de Angical": "var(--dash-slate)",
};
const corConv = (c: string) => CONV_COR[c] ?? "var(--dash-blue-dark)";

const FASE_ROTULO: Record<string, string> = {
    aguardando: "Aguardando", fase01: "Indo retirar o óbito", fase02: "Corpo na clínica", fase03: "Início da conservação", fase04: "Fim da conservação",
    fase05: "Início da ornamentação", fase06: "Fim da ornamentação", fase12: "Corpo pronto", fase07: "Transportando p/ velório",
    fase08: "Entrega de corpo", fase09: "Transportando p/ sepultamento", fase10: "Sepultamento concluído", fase11: "Material recolhido",
};
const faseNome = (s?: string | null) => { const k = String(s ?? "").trim().toLowerCase(); return FASE_ROTULO[k] ?? (s || "—"); };

const STATUS_COR: Record<string, string> = {
    aguardando: "bg-slate-500", fase01: "bg-amber-600", fase02: "bg-zinc-600", fase03: "bg-blue-600", fase04: "bg-fuchsia-600",
    fase05: "bg-rose-600", fase06: "bg-fuchsia-700", fase12: "bg-emerald-600", fase07: "bg-cyan-600", fase08: "bg-violet-600",
    fase09: "bg-orange-600", fase10: "bg-green-700", fase11: "bg-slate-700",
};

/* =========================================================
   COMPONENTES BASE
========================================================= */

function ThemeStyles() {
    return (
        <style jsx global>{`
            :root, html:not(.dark) {
                --dash-bg: #f5fafe; --dash-card: #ffffff; --dash-card-soft: #f8fcff; --dash-text: #1f3552; --dash-text-soft: #5c7492;
                --dash-border-light: #cfe4f3; --dash-border-strong: #2f6f91; --dash-blue: #4d8fd5; --dash-blue-dark: #226385;
                --dash-yellow: #f2bc00; --dash-green: #1f7a2d; --dash-teal: #0f8b8d; --dash-slate: #5a6f86; --dash-empty: #e6eef5;
                --dash-danger-border: #f2b0b0; --dash-danger-bg: #fff5f5; --dash-danger-text: #b53b3b; --dash-warn: #9a6700;
                --dash-heat-1: #d6e8f8; --dash-heat-2: #a9cdf0; --dash-heat-3: #6aa9ee; --dash-heat-4: #2f7ec5; --dash-heat-5: #174f86;
                color-scheme: light;
            }
            html.dark {
                --dash-bg: #07111f; --dash-card: #101c2b; --dash-card-soft: #0b1624; --dash-text: #eaf4ff; --dash-text-soft: #9fb8d3;
                --dash-border-light: #213952; --dash-border-strong: #62b48f; --dash-blue: #6aa9ee; --dash-blue-dark: #2f7ea5;
                --dash-yellow: #f4c400; --dash-green: #45a85a; --dash-teal: #2db5b7; --dash-slate: #89a2ba; --dash-empty: #243446;
                --dash-danger-border: #8a3b44; --dash-danger-bg: #321820; --dash-danger-text: #ffb7c0; --dash-warn: #e3b341;
                --dash-heat-1: #16304c; --dash-heat-2: #1e4f7c; --dash-heat-3: #2f7ec5; --dash-heat-4: #6aa9ee; --dash-heat-5: #b9d9fb;
                color-scheme: dark;
            }
            html, body { background: var(--dash-bg) !important; }
        `}</style>
    );
}

function Card({ titulo, dica, acao, children, className = "" }: { titulo?: string; dica?: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl border p-4 sm:p-5 min-w-0 ${className}`} style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)" }}>
            {(titulo || acao) && (
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                        {titulo && <h3 className="text-base font-extrabold" style={{ color: "var(--dash-text)" }}>{titulo}</h3>}
                        {dica && <p className="text-xs" style={{ color: "var(--dash-text-soft)" }}>{dica}</p>}
                    </div>
                    {acao}
                </div>
            )}
            {children}
        </section>
    );
}

function Kpi({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; alerta?: "ruim" | "atencao" }) {
    const faixa = alerta === "ruim" ? "var(--dash-danger-text)" : alerta === "atencao" ? "var(--dash-warn)" : "transparent";
    return (
        <div className="rounded-2xl border p-4 min-w-0" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", borderLeft: `5px solid ${faixa}` }}>
            <div className="text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{rotulo}</div>
            <div className="mt-1 text-2xl font-black tabular-nums" style={{ color: "var(--dash-text)" }}>{valor}</div>
            {detalhe && <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{detalhe}</div>}
        </div>
    );
}

function Vazio({ texto = "Sem dados no período" }: { texto?: string }) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--dash-text-soft)" }}>{texto}</div>;
}

/** Barras horizontais com rótulo, valor e participação. */
function Barras({ itens, total, cor = "var(--dash-blue)", formato, semParticipacao, onClick, ativo, max }: {
    itens: { nome: string; total: number; cor?: string; extra?: string }[]; total?: number; cor?: string;
    formato?: (v: number) => string; semParticipacao?: boolean; onClick?: (nome: string) => void; ativo?: string; max?: number;
}) {
    if (!itens.length || !itens.some((i) => i.total)) return <Vazio />;
    const m = max ?? Math.max(...itens.map((i) => i.total));
    const soma = total ?? itens.reduce((a, i) => a + i.total, 0);
    return (
        <div className="flex flex-col gap-1.5">
            {itens.map((i) => (
                <button key={i.nome} type="button" disabled={!onClick} onClick={() => onClick?.(i.nome)} title={i.extra ?? `${i.nome}: ${fmtN(i.total)}`}
                    className={`grid grid-cols-[minmax(90px,42%)_1fr] items-center gap-2 rounded-md px-1 py-0.5 text-left ${onClick ? "hover:bg-[var(--dash-card-soft)] cursor-pointer" : "cursor-default"}`}>
                    <span className={`truncate text-right text-xs ${ativo === i.nome ? "font-extrabold" : "font-semibold"}`} style={{ color: "var(--dash-text)" }}>{i.nome}</span>
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="h-3 rounded" style={{ width: `${Math.max(i.total ? 2 : 0, (i.total / (m || 1)) * 75)}%`, background: i.cor ?? cor }} />
                        <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--dash-text)" }}>
                            {formato ? formato(i.total) : fmtN(i.total)}
                            {!semParticipacao && <span style={{ color: "var(--dash-text-soft)" }}> · {fmtP(soma ? (i.total / soma) * 100 : 0)}</span>}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}

/** Colunas empilhadas (SVG) para a série temporal. */
function Colunas({ pontos, series, altura = 220 }: { pontos: { rotulo: string; titulo: string; valores: number[] }[]; series: { nome: string; cor: string }[]; altura?: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const totais = pontos.map((p) => p.valores.reduce((a, v) => a + v, 0));
    if (!pontos.length || !totais.some(Boolean)) return <Vazio />;
    const W = 1000, H = altura, ml = 34, mb = 24, mt = 8;
    const max = Math.max(1, ...totais), passo = (W - ml) / pontos.length, bw = Math.max(2, Math.min(34, passo * 0.7));
    const y = (v: number) => mt + (H - mt - mb) * (1 - v / max);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 10) / 10);
    const cada = Math.ceil(pontos.length / 14);
    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" role="img" aria-label="Atendimentos no período">
                {ticks.map((t) => (<g key={t}><line x1={ml} x2={W} y1={y(t)} y2={y(t)} stroke="var(--dash-border-light)" /><text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--dash-text-soft)">{t}</text></g>))}
                {pontos.map((p, i) => {
                    let acc = 0;
                    const x = ml + passo * i + (passo - bw) / 2;
                    return (
                        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                            <rect x={ml + passo * i} y={mt} width={passo} height={H - mt - mb} fill="transparent" />
                            {p.valores.map((v, si) => {
                                if (!v) return null;
                                const y1 = y(acc + v), h = y(acc) - y1 - (acc ? 1 : 0);
                                acc += v;
                                return <rect key={si} x={x} y={y1} width={bw} height={Math.max(0, h)} rx={2} fill={series[si].cor} opacity={hover === null || hover === i ? 1 : 0.55} />;
                            })}
                            {i % cada === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--dash-text-soft)">{p.rotulo}</text>}
                        </g>
                    );
                })}
            </svg>
            {hover !== null && (
                <div className="pointer-events-none absolute top-0 right-0 rounded-lg px-3 py-2 text-xs shadow-lg" style={{ background: "var(--dash-text)", color: "var(--dash-bg)" }}>
                    <div className="font-bold">{pontos[hover].titulo}</div>
                    {series.map((s, si) => pontos[hover].valores[si] ? <div key={s.nome} className="flex justify-between gap-4 tabular-nums"><span>{s.nome}</span><span>{pontos[hover].valores[si]}</span></div> : null)}
                    <div className="flex justify-between gap-4 font-bold tabular-nums"><span>Total</span><span>{totais[hover]}</span></div>
                </div>
            )}
        </div>
    );
}

function MapaCalor({ m }: { m: number[][] }) {
    const max = Math.max(0, ...m.flat());
    if (!max) return <Vazio />;
    const dias = [1, 2, 3, 4, 5, 6, 0], nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const nivel = (v: number) => (v ? `var(--dash-heat-${1 + Math.min(4, Math.floor((v / max) * 4.999))})` : "var(--dash-empty)");
    return (
        <div className="overflow-x-auto">
            <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0,1fr))" }}>
                {dias.map((d) => (
                    <React.Fragment key={d}>
                        <span className="text-right text-[11px] pr-1" style={{ color: "var(--dash-text-soft)" }}>{nomes[d]}</span>
                        {m[d].map((v, h) => <span key={h} title={`${nomes[d]} ${pad2(h)}h: ${v}`} className="h-5 rounded-[3px]" style={{ background: nivel(v) }} />)}
                    </React.Fragment>
                ))}
                <span />
                {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px]" style={{ color: "var(--dash-text-soft)" }}>{h % 3 === 0 ? `${pad2(h)}h` : ""}</span>)}
            </div>
        </div>
    );
}

function Tabela({ cabecalho, linhas, larguraMin = 640 }: { cabecalho: React.ReactNode[]; linhas: React.ReactNode[][]; larguraMin?: number }) {
    if (!linhas.length) return <Vazio />;
    return (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }}>
            <table className="w-full text-sm" style={{ minWidth: larguraMin, color: "var(--dash-text)" }}>
                <thead><tr style={{ background: "var(--dash-card-soft)" }}>{cabecalho.map((c, i) => <th key={i} className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${i ? "text-right" : "text-left"}`} style={{ color: "var(--dash-text-soft)" }}>{c}</th>)}</tr></thead>
                <tbody>{linhas.map((l, i) => <tr key={i} className="border-t" style={{ borderColor: "var(--dash-border-light)" }}>{l.map((c, j) => <td key={j} className={`px-3 py-2 tabular-nums whitespace-nowrap ${j ? "text-right" : "text-left font-semibold"}`}>{c}</td>)}</tr>)}</tbody>
            </table>
        </div>
    );
}

/* =========================================================
   ABAS
========================================================= */

function AbaGeral({ d, filtrar }: { d: Painel; filtrar: (campo: "convenio", v: string) => void }) {
    const r = d.resumo;
    const series = d.convenios.map((c) => ({ nome: c.nome, cor: corConv(c.nome) }));
    const pontos = d.serie.pontos.map((p) => ({
        rotulo: p.rotulo,
        titulo: d.serie.granularidade === "semana" ? `Semana de ${p.rotulo}` : p.rotulo,
        valores: series.map((s) => p.por_convenio[s.nome] ?? 0),
    }));
    const piorQual = [...d.perfil.qualidade].sort((a, b) => a.pct - b.pct)[0];
    const lenta = [...d.equipe.etapas].filter((e) => e.tipo === "execucao" && e.chave !== "velorio" && e.n >= 3).sort((a, b) => (b.mediana_h ?? 0) - (a.mediana_h ?? 0))[0];
    const topDia = [...d.dia_semana].sort((a, b) => b.media - a.media)[0];
    const destaques: [string, React.ReactNode][] = [];
    if (r.variacao_pct != null) destaques.push(["Tendência", <><b>{fmtN(r.total)}</b> atendimentos, <b>{r.variacao_pct >= 0 ? `${fmtP(r.variacao_pct)} a mais` : `${fmtP(-r.variacao_pct)} a menos`}</b> que no período anterior ({fmtN(r.anterior)}).</>]);
    if (topDia) destaques.push(["Pico de demanda", <><b>{topDia.dia}</b> é o dia mais movimentado ({topDia.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia).</>]);
    if (d.convenios[0]) destaques.push(["Convênio", <><b>{d.convenios[0].nome}</b> responde por {fmtP((d.convenios[0].total / (r.total || 1)) * 100)} dos atendimentos.</>]);
    if (lenta) destaques.push(["Etapa mais longa", <>Fora o velório, <b>{lenta.rotulo.toLowerCase()}</b> tem a maior mediana: <b>{fmtH(lenta.mediana_h)}</b>.</>]);
    if (piorQual) destaques.push(["Atenção ao cadastro", <><b>{piorQual.campo}</b> preenchido em só {fmtP(piorQual.pct)} dos atendimentos.</>]);

    return (
        <div className="flex flex-col gap-4">
            {d.em_andamento.length > 0 && (
                <div>
                    <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Em andamento agora · {d.em_andamento.length}</h2>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                        {d.em_andamento.map((a) => (
                            <div key={a.id} className="min-w-[240px] rounded-xl border p-3" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)" }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-extrabold" style={{ color: "var(--dash-text)" }}>{a.falecido}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${STATUS_COR[a.status] ?? "bg-slate-500"}`}>{a.status_rotulo}</span>
                                </div>
                                <div className="mt-1 text-xs" style={{ color: "var(--dash-text-soft)" }}>{a.velorio} · {a.convenio}</div>
                                <div className="text-xs" style={{ color: "var(--dash-text-soft)" }}>Aberto há {fmtH(a.horas_desde_cadastro)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi rotulo="Atendimentos" valor={fmtN(r.total)} detalhe={r.variacao_pct == null ? `anterior: ${fmtN(r.anterior)}` : <span style={{ color: r.variacao_pct >= 0 ? "var(--dash-green)" : "var(--dash-danger-text)" }}>{r.variacao_pct >= 0 ? "▲" : "▼"} {fmtP(Math.abs(r.variacao_pct))} vs {fmtN(r.anterior)}</span>} />
                <Kpi rotulo="Média por dia" valor={r.media_dia.toLocaleString("pt-BR")} detalhe={`${d.periodo.dias} dia(s)`} />
                <Kpi rotulo="Pico em um dia" valor={r.pico ? fmtN(r.pico.total) : "—"} detalhe={r.pico ? `em ${dataBR(r.pico.data)}` : ""} />
                <Kpi rotulo="Idade média" valor={r.idade_media != null ? `${r.idade_media} anos` : "—"} detalhe={`${fmtN(r.idade_n)} com nascimento`} />
                <Kpi rotulo="Cadastro → sepultamento" valor={fmtH(r.ciclo_mediana_h)} detalhe={r.ciclo_n ? `mediana · 90% em até ${fmtH(r.ciclo_p90_h)}` : "sem marcações"} />
                <Kpi rotulo="Ainda no quadro" valor={fmtN(r.em_andamento_periodo)} detalhe="deste período" alerta={r.em_andamento_periodo ? "atencao" : undefined} />
            </div>

            {destaques.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {destaques.map(([k, v]) => (
                        <div key={k} className="rounded-xl border p-3 text-sm" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text-soft)" }}>
                            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-blue-dark)" }}>{k}</div>
                            <div style={{ color: "var(--dash-text)" }}>{v}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <Card titulo="Volume de atendimentos" dica={`Por ${d.serie.granularidade} · empilhado por convênio`} className="xl:col-span-2"
                    acao={<div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--dash-text-soft)" }}>{series.map((s) => <span key={s.nome} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}</div>}>
                    <Colunas pontos={pontos} series={series} />
                </Card>
                <Card titulo="Mix por convênio" dica="Clique para filtrar">
                    <Barras itens={d.convenios.map((c) => ({ ...c, cor: corConv(c.nome) }))} onClick={(v) => filtrar("convenio", v)} />
                </Card>
                <Card titulo="Quando os atendimentos chegam" dica="Horário de cadastro por dia da semana" className="xl:col-span-2"><MapaCalor m={d.heatmap} /></Card>
                <Card titulo="Média por dia da semana" dica="Atendimentos por dia no período">
                    <Barras itens={d.dia_semana.map((x) => ({ nome: x.dia, total: x.media, extra: `${x.total} em ${x.dias} dia(s)` }))} formato={(v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} semParticipacao />
                </Card>
                <Card titulo="Local do velório" dica="Agrupado"><Barras itens={d.velorio} total={r.total} /></Card>
                <Card titulo="Local de sepultamento" dica="Top 8"><Barras itens={d.cemiterio.slice(0, 8)} total={r.total} /></Card>
            </div>
        </div>
    );
}

function AbaEquipe({ d }: { d: Painel }) {
    const [modo, setModo] = useState<"n" | "horas" | "mediana">("n");
    const e = d.equipe;
    const exec = e.etapas.filter((x) => x.tipo === "execucao");
    const esp = e.etapas.filter((x) => x.tipo === "espera");
    const pv = e.pontualidade.velorio, ps = e.pontualidade.sepultamento;
    const loteTot = e.registro_lote.reduce((a, x) => a + x.trocas, 0), loteN = e.registro_lote.reduce((a, x) => a + x.em_lote, 0);
    const colMax: Record<string, number> = {};
    const val = (c?: { n: number; horas: number; mediana_h: number | null }) => (!c ? null : modo === "n" ? c.n : modo === "horas" ? c.horas : c.mediana_h);
    exec.forEach((x) => { colMax[x.chave] = Math.max(0, ...e.matriz.map((l) => val(l.etapas[x.chave]) ?? 0)); });
    const tom = (v: number | null, m: number) => {
        if (!v || !m) return {};
        const t = v / m, k = t > 0.8 ? 5 : t > 0.6 ? 4 : t > 0.4 ? 3 : t > 0.2 ? 2 : 1;
        return { background: `var(--dash-heat-${k})`, color: k >= 4 ? "#fff" : "var(--dash-text)" };
    };
    const semHistorico = d.resumo.com_historico < d.resumo.total;

    return (
        <div className="flex flex-col gap-4">
            {semHistorico && (
                <div className="rounded-xl border px-4 py-2 text-xs" style={{ borderColor: "var(--dash-border-light)", color: "var(--dash-text-soft)", background: "var(--dash-card)" }}>
                    {fmtN(d.resumo.total - d.resumo.com_historico)} atendimento(s) do período não têm histórico de fases e ficam de fora dos tempos.
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Kpi rotulo="Cadastro → sepultamento" valor={fmtH(d.resumo.ciclo_mediana_h)} detalhe={`mediana · n=${fmtN(d.resumo.ciclo_n)}`} />
                <Kpi rotulo="Tempo ocioso por atendimento" valor={fmtH(e.ocioso.mediana_h)} detalhe={`mediana · 90% até ${fmtH(e.ocioso.p90_h)}`} />
                <Kpi rotulo="Velório no horário" valor={fmtP(pv.no_horario_pct)} detalhe={`até 15 min · atraso mediano ${pv.atraso_mediana_min ?? "—"} min · n=${pv.n}`} alerta={pv.n && pv.no_horario_pct < 70 ? "atencao" : undefined} />
                <Kpi rotulo="Sepultamento no horário" valor={fmtP(ps.no_horario_pct)} detalhe={`até 15 min · atraso mediano ${ps.atraso_mediana_min ?? "—"} min · n=${ps.n}`} alerta={ps.n && ps.no_horario_pct < 70 ? "atencao" : undefined} />
                <Kpi rotulo="Fases marcadas em lote" valor={fmtP(loteTot ? (loteN / loteTot) * 100 : 0)} detalhe="< 60 s da fase anterior" alerta={loteTot && loteN / loteTot > 0.15 ? "atencao" : undefined} />
            </div>

            <Card titulo="Tempo por etapa" dica="Mediana entre o início e o fim de cada etapa (manual de procedimentos)">
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
                    {exec.map((x) => (
                        <div key={x.chave} className="rounded-xl p-3" style={{ background: "var(--dash-card-soft)", border: "1px solid var(--dash-border-light)" }} title={`Média ${fmtH(x.media_h)} · 90% até ${fmtH(x.p90_h)}`}>
                            <div className="text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</div>
                            <div className="text-xl font-black tabular-nums" style={{ color: "var(--dash-text)" }}>{x.n ? fmtH(x.mediana_h) : "—"}</div>
                            <div className="text-[11px] tabular-nums" style={{ color: "var(--dash-text-soft)" }}>n={x.n}{x.n ? ` · 90% até ${fmtH(x.p90_h)}` : ""}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-3 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Esperas entre etapas</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    {esp.map((x) => (
                        <div key={x.chave} className="rounded-lg px-3 py-2" style={{ background: "var(--dash-empty)" }}>
                            <div className="text-xs" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</div>
                            <div className="text-base font-extrabold tabular-nums" style={{ color: "var(--dash-text)" }}>{x.n ? fmtH(x.mediana_h) : "—"} <span className="text-[11px] font-normal" style={{ color: "var(--dash-text-soft)" }}>n={x.n}</span></div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card titulo="Etapas por agente" dica="Cada etapa é creditada a quem tocou o comando de início"
                acao={<div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--dash-border-light)" }}>{([["n", "Quantidade"], ["horas", "Horas totais"], ["mediana", "Horas (mediana)"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setModo(k)} className="rounded-md px-3 py-1 text-xs font-bold" style={modo === k ? { background: "var(--dash-blue-dark)", color: "#fff" } : { color: "var(--dash-text-soft)" }}>{l}</button>))}</div>}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-separate text-sm" style={{ borderSpacing: 3, color: "var(--dash-text)" }}>
                        <thead><tr><th className="text-left text-xs" style={{ color: "var(--dash-text-soft)" }}>Agente</th>{exec.map((x) => <th key={x.chave} className="text-center text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</th>)}<th className="text-center text-xs" style={{ color: "var(--dash-text-soft)" }}>Total</th></tr></thead>
                        <tbody>
                            {e.matriz.map((l) => (
                                <tr key={l.agente}>
                                    <td className="font-bold whitespace-nowrap">{l.agente}</td>
                                    {exec.map((x) => {
                                        const c = l.etapas[x.chave]; const v = val(c);
                                        return <td key={x.chave} className="rounded-md px-2 py-1.5 text-center tabular-nums" style={tom(v, colMax[x.chave])} title={c ? `${c.n} vez(es) · ${fmtH(c.horas)} somadas · mediana ${fmtH(c.mediana_h)}` : ""}>{v == null ? <span style={{ color: "var(--dash-text-soft)" }}>—</span> : modo === "n" ? v : fmtH(v)}</td>;
                                    })}
                                    <td className="rounded-md px-2 py-1.5 text-center font-extrabold tabular-nums" style={{ background: "var(--dash-card-soft)" }}>{modo === "n" ? l.total_n : fmtH(l.total_h)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!e.matriz.length && <Vazio />}
                </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card titulo="Etapas concluídas por mês" dica="Etapas de execução iniciadas por cada agente">
                    <Tabela cabecalho={["Agente", ...e.meses.map(mesRotulo), "Total"]} linhas={e.mensal.map((l) => [l.agente, ...e.meses.map((m) => l.meses[m] || "—"), <b key="t">{Object.values(l.meses).reduce((a, v) => a + v, 0)}</b>])} larguraMin={420} />
                </Card>
                <Card titulo="Pontualidade por agente" dica="% no horário combinado (até 15 min) · atraso mediano">
                    <Tabela cabecalho={["Agente", "Velório (n)", "No horário", "Atraso", "Sepult. (n)", "No horário", "Atraso"]}
                        linhas={Array.from(new Set([...pv.por_agente.map((x) => x.agente), ...ps.por_agente.map((x) => x.agente)])).map((ag) => {
                            const a = pv.por_agente.find((x) => x.agente === ag), b = ps.por_agente.find((x) => x.agente === ag);
                            return [ag, a?.n ?? "—", a ? fmtP(a.no_horario_pct) : "—", a?.atraso_mediana_min != null ? `${a.atraso_mediana_min} min` : "—", b?.n ?? "—", b ? fmtP(b.no_horario_pct) : "—", b?.atraso_mediana_min != null ? `${b.atraso_mediana_min} min` : "—"];
                        })} larguraMin={560} />
                </Card>
                <Card titulo="Evidências e registro no momento real" dica="Fotos obrigatórias (meta 100%) e fases marcadas a menos de 60 s da anterior">
                    <Tabela cabecalho={["Agente", "Foto ornamentação", "Foto entrega", "Trocas de fase", "Em lote"]}
                        linhas={Array.from(new Set([...e.evidencias.map((x) => x.agente), ...e.registro_lote.map((x) => x.agente)])).map((ag) => {
                            const v = e.evidencias.find((x) => x.agente === ag), l = e.registro_lote.find((x) => x.agente === ag);
                            return [ag, v?.ornamentacao.n ? `${fmtP(v.ornamentacao.pct)} (${v.ornamentacao.n})` : "—", v?.entrega.n ? `${fmtP(v.entrega.pct)} (${v.entrega.n})` : "—", l?.trocas ?? "—",
                                l ? <span key="l" style={{ color: l.pct > 15 ? "var(--dash-danger-text)" : undefined }}>{fmtP(l.pct)}</span> : "—"];
                        })} larguraMin={520} />
                </Card>
                <Card titulo="Atendimentos abertos por agente" dica="Quem cadastrou o atendimento (campo agente)">
                    <Barras itens={e.titulares.slice(0, 12)} total={d.resumo.total} />
                </Card>
            </div>
        </div>
    );
}

function AbaPerfil({ d }: { d: Painel }) {
    const p = d.perfil, n = d.resumo.total;
    const corQ = (v: number) => (v >= 85 ? "var(--dash-green)" : v >= 50 ? "var(--dash-yellow)" : "var(--dash-danger-text)");
    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Card titulo="Adesão a serviços e itens" dica="% dos atendimentos do período">
                <Barras itens={p.servicos.map((s) => ({ nome: s.nome, total: s.pct, cor: s.nome.startsWith("·") ? "var(--dash-heat-3)" : "var(--dash-blue)", extra: `${s.total} de ${n}` }))} formato={(v) => fmtP(v)} semParticipacao max={100} />
            </Card>
            <Card titulo="Urnas mais utilizadas" dica="Agrupadas pelo número do modelo"><Barras itens={p.urnas.slice(0, 8)} total={n} /></Card>
            <Card titulo="Roupas mais utilizadas" dica="Top 8"><Barras itens={p.roupas.slice(0, 8)} total={n} /></Card>
            <Card titulo="Faixa etária do falecido" dica={`${fmtN(d.resumo.idade_n)} de ${fmtN(n)} com data de nascimento`}><Barras itens={p.faixas_etarias} cor="var(--dash-slate)" /></Card>
            <Card titulo="Religião"><Barras itens={p.religiao} /></Card>
            <Card titulo="Fase atual" dica="Situação registrada no sistema">
                <Barras itens={p.status.map((s) => ({ nome: s.rotulo, total: s.total }))} cor="var(--dash-teal)" />
            </Card>
            <Card titulo="Qualidade do cadastro" dica="% com o campo preenchido · verde ≥ 85%, amarelo ≥ 50%" className="xl:col-span-2">
                <Barras itens={[...p.qualidade].sort((a, b) => b.pct - a.pct).map((q) => ({ nome: q.campo, total: q.pct, cor: corQ(q.pct), extra: `${q.total} de ${n}` }))} formato={(v) => fmtP(v)} semParticipacao max={100} />
            </Card>
            <Card titulo="Qualidade por agente" dica="Campos essenciais preenchidos nos atendimentos que abriu">
                <Barras itens={p.qualidade_agente.filter((q) => q.n >= 2).map((q) => ({ nome: q.agente, total: q.pct, cor: corQ(q.pct), extra: `${q.n} atendimento(s)` }))} formato={(v) => `${v}%`} semParticipacao max={100} />
            </Card>
        </div>
    );
}

type Ordem = { campo: keyof ListaItem; dir: 1 | -1 };
const COLUNAS: [keyof ListaItem, string][] = [
    ["id", "ID"], ["falecido", "Falecido"], ["criado_em", "Cadastro"], ["data_sepultamento", "Sepultamento"], ["idade", "Idade"],
    ["convenio", "Convênio"], ["agente", "Agente"], ["velorio", "Velório"], ["cemiterio", "Cemitério"], ["urna", "Urna"],
    ["ciclo_h", "Ciclo"], ["status_rotulo", "Fase"],
];

function AbaLista({ d, abrir }: { d: Painel; abrir: (id: number) => void }) {
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState<Ordem>({ campo: "criado_em", dir: -1 });
    const [pag, setPag] = useState(0);
    const POR = 25;
    const linhas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        const base = q ? d.lista.filter((x) => [x.id, x.falecido, x.agente, x.convenio, x.urna, x.cemiterio, x.local_velorio].join(" ").toLowerCase().includes(q)) : d.lista;
        return [...base].sort((a, b) => {
            const va = a[ordem.campo] ?? "", vb = b[ordem.campo] ?? "";
            return (va > vb ? 1 : va < vb ? -1 : 0) * ordem.dir;
        });
    }, [d.lista, busca, ordem]);
    useEffect(() => setPag(0), [busca, d]);
    const paginas = Math.max(1, Math.ceil(linhas.length / POR));
    const fatia = linhas.slice(pag * POR, pag * POR + POR);

    const exportar = () => {
        const cab = ["ID", "Falecido", "Cadastro", "Falecimento", "Sepultamento", "Idade", "Convênio", "Agente", "Velório", "Local do velório", "Cemitério", "Urna", "Roupa", "Ciclo (h)", "Ocioso (h)", "Fase"];
        const q = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const csv = [cab.join(";"), ...linhas.map((x) => [x.id, x.falecido, x.criado_em, x.data_falecimento, x.data_sepultamento, x.idade, x.convenio, x.agente, x.velorio, x.local_velorio, x.cemiterio, x.urna, x.roupa, x.ciclo_h?.toString().replace(".", ","), x.ocioso_h?.toString().replace(".", ","), x.status_rotulo].map(q).join(";"))].join("\n");
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url; a.download = `atendimentos_${d.periodo.inicio}_a_${d.periodo.fim}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Card titulo="Lista analítica" dica={`${fmtN(linhas.length)} atendimento(s) · clique numa linha para ver a ficha`}
            acao={<div className="flex flex-wrap gap-2">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar falecido, agente, urna…" className="rounded-lg border px-3 py-1.5 text-sm" style={{ background: "var(--dash-card-soft)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }} />
                <button type="button" onClick={exportar} className="rounded-lg border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }}>Exportar CSV</button>
            </div>}>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }}>
                <table className="w-full min-w-[1100px] text-sm" style={{ color: "var(--dash-text)" }}>
                    <thead><tr style={{ background: "var(--dash-card-soft)" }}>
                        {COLUNAS.map(([c, l]) => (
                            <th key={c} onClick={() => setOrdem((o) => ({ campo: c, dir: o.campo === c ? (o.dir === 1 ? -1 : 1) : 1 }))} className="cursor-pointer select-none px-3 py-2 text-left text-xs font-bold whitespace-nowrap" style={{ color: "var(--dash-text-soft)" }}>
                                {l}{ordem.campo === c ? (ordem.dir === 1 ? " ↑" : " ↓") : ""}
                            </th>))}
                    </tr></thead>
                    <tbody>
                        {fatia.map((x) => (
                            <tr key={x.id} onClick={() => abrir(x.id)} className="cursor-pointer border-t hover:bg-[var(--dash-card-soft)]" style={{ borderColor: "var(--dash-border-light)" }}>
                                <td className="px-3 py-2 tabular-nums">#{x.id}</td>
                                <td className="max-w-[240px] truncate px-3 py-2 font-bold">{x.falecido}</td>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{dataHoraBR(x.criado_em)}</td>
                                <td className="px-3 py-2 tabular-nums">{dataBR(x.data_sepultamento)}</td>
                                <td className="px-3 py-2 tabular-nums">{x.idade ?? "—"}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.convenio}</td>
                                <td className="px-3 py-2">{x.agente}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.velorio}</td>
                                <td className="max-w-[200px] truncate px-3 py-2">{x.cemiterio}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.urna}</td>
                                <td className="px-3 py-2 tabular-nums">{fmtH(x.ciclo_h)}</td>
                                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap ${STATUS_COR[x.status] ?? "bg-slate-500"}`}>{x.status_rotulo}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!fatia.length && <Vazio texto="Nenhum atendimento com esses filtros" />}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--dash-text-soft)" }}>
                <span>{linhas.length ? `${pag * POR + 1}–${pag * POR + fatia.length} de ${linhas.length}` : ""}</span>
                <span className="flex gap-2">
                    <button type="button" disabled={pag === 0} onClick={() => setPag((p) => p - 1)} className="rounded-md border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--dash-border-light)" }}>← Anterior</button>
                    <button type="button" disabled={pag >= paginas - 1} onClick={() => setPag((p) => p + 1)} className="rounded-md border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--dash-border-light)" }}>Próxima →</button>
                </span>
            </div>
        </Card>
    );
}

function Ficha({ item, etapasDef, fechar }: { item: ListaItem; etapasDef: { chave: string; rotulo: string; tipo: string }[]; fechar: () => void }) {
    const [hist, setHist] = useState<any[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setHist(null); setErro(null);
        fetch(`${HISTORICO_URL}${item.id}&_ts=${Date.now()}`, { credentials: "include", cache: "no-store" })
            .then((r) => r.json())
            .then((j) => { if (!vivo) return; const arr = Array.isArray(j) ? j : j?.dados ?? j?.data ?? []; setHist(arr); })
            .catch(() => vivo && setErro("Não foi possível carregar o histórico."));
        return () => { vivo = false; };
    }, [item.id]);
    useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && fechar(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [fechar]);
    const trocas = (hist ?? []).filter((h) => h?.status_novo && h.status_novo !== h.status_anterior);

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
            <div className="absolute inset-0 bg-black/40" onClick={fechar} aria-hidden />
            <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden shadow-2xl" style={{ background: "var(--dash-card)", color: "var(--dash-text)" }}>
                <div className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--dash-border-light)" }}>
                    <div>
                        <h2 className="text-xl font-black">{item.falecido}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                            <span className={`rounded-full px-2 py-0.5 font-bold text-white ${STATUS_COR[item.status] ?? "bg-slate-500"}`}>{item.status_rotulo}</span>
                            <span>#{item.id}</span><span>· {item.convenio}</span><span>· aberto por {item.agente}</span>
                        </div>
                    </div>
                    <button type="button" onClick={fechar} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--dash-border-light)" }} aria-label="Fechar">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 text-sm">
                    <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1">
                        {[["Cadastro", dataHoraBR(item.criado_em)], ["Falecimento", dataBR(item.data_falecimento)], ["Idade", item.idade != null ? `${item.idade} anos` : "—"], ["Religião", item.religiao],
                        ["Velório", `${item.velorio}${item.local_velorio && !/^https?:/.test(item.local_velorio) ? ` — ${item.local_velorio}` : ""}`], ["Sepultamento", `${item.cemiterio} · ${dataBR(item.data_sepultamento)}`],
                        ["Urna", item.urna], ["Roupa", item.roupa || "—"], ["Ciclo total", fmtH(item.ciclo_h)], ["Tempo ocioso", fmtH(item.ocioso_h)]].map(([k, v]) => (
                            <React.Fragment key={k}><dt style={{ color: "var(--dash-text-soft)" }}>{k}</dt><dd className="break-words">{v}</dd></React.Fragment>))}
                    </dl>
                    <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Tempo por etapa</h4>
                    {Object.keys(item.etapas).length ? (
                        <div className="flex flex-col gap-1">
                            {etapasDef.filter((e) => item.etapas[e.chave]).map((e) => (
                                <div key={e.chave} className="flex justify-between gap-3 rounded-md px-2 py-1" style={{ background: e.tipo === "espera" ? "var(--dash-empty)" : "var(--dash-card-soft)" }}>
                                    <span style={{ color: e.tipo === "espera" ? "var(--dash-text-soft)" : "var(--dash-text)" }}>{e.rotulo}</span>
                                    <span className="tabular-nums whitespace-nowrap">{fmtH(item.etapas[e.chave].h)}{item.etapas[e.chave].quem ? ` · ${item.etapas[e.chave].quem}` : ""}</span>
                                </div>))}
                        </div>
                    ) : <p style={{ color: "var(--dash-text-soft)" }}>Sem histórico de fases.</p>}
                    <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Linha do tempo</h4>
                    {erro ? <p style={{ color: "var(--dash-danger-text)" }}>{erro}</p> : hist === null ? <p style={{ color: "var(--dash-text-soft)" }}>Carregando…</p> : (
                        <ol className="border-l-2 pl-4" style={{ borderColor: "var(--dash-border-light)" }}>
                            {trocas.map((h, i) => (
                                <li key={i} className="mb-2">
                                    <div className="font-semibold">{faseNome(h.status_novo)} <span className="text-xs font-normal" style={{ color: "var(--dash-text-soft)" }}>({h.status_novo})</span></div>
                                    <div className="text-xs tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{dataHoraBR(String(h.datahora ?? ""))} · {h.usuario ?? "—"}</div>
                                </li>))}
                            {!trocas.length && <li style={{ color: "var(--dash-text-soft)" }}>Sem trocas de fase registradas.</li>}
                        </ol>
                    )}
                </div>
            </aside>
        </div>
    );
}

/* =========================================================
   PÁGINA
========================================================= */

type Aba = "geral" | "equipe" | "perfil" | "lista";

export default function PainelAtendimentosPage() {
    const [preset, setPreset] = useState<Preset>("30d");
    const [range, setRange] = useState(() => rangeDe("30d"));
    const [ref, setRef] = useState<"criacao" | "falecimento" | "sepultamento">("criacao");
    const [convenio, setConvenio] = useState("");
    const [agente, setAgente] = useState("");
    const [aba, setAba] = useState<Aba>("geral");
    const [dados, setDados] = useState<Painel | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<{ tipo: "login" | "permissao" | "falha"; msg: string } | null>(null);
    const [fichaId, setFichaId] = useState<number | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true); setErro(null);
        const qs = new URLSearchParams({ inicio: range.inicio, fim: range.fim, ref, _ts: String(Date.now()) });
        if (convenio) qs.set("convenio", convenio);
        if (agente) qs.set("agente", agente);
        const ac = new AbortController();
        const t = window.setTimeout(() => ac.abort(), 30000);
        try {
            const res = await fetch(`${PAINEL_URL}?${qs}`, { credentials: "include", cache: "no-store", signal: ac.signal });
            const json = (await res.json().catch(() => null)) as Painel | null;
            if (res.status === 401 || json?.need_login) { setErro({ tipo: "login", msg: json?.msg || "Faça login para ver o painel." }); return; }
            if (res.status === 403 || json?.sem_permissao) { setErro({ tipo: "permissao", msg: json?.msg || "O painel de atendimentos é restrito à gerência." }); return; }
            if (!res.ok || !json?.ok) throw new Error(json?.msg || `HTTP ${res.status}`);
            setDados(json);
        } catch (e: any) {
            setErro({ tipo: "falha", msg: e?.name === "AbortError" ? "O servidor demorou a responder. Tente de novo." : e?.message || "Falha ao carregar o painel." });
        } finally {
            window.clearTimeout(t);
            setCarregando(false);
        }
    }, [range, ref, convenio, agente]);

    useEffect(() => { carregar(); }, [carregar]);

    const escolherPreset = (p: Preset) => { setPreset(p); setRange(rangeDe(p)); };
    const filtrar = (campo: "convenio", v: string) => { if (campo === "convenio") setConvenio((c) => (c === v ? "" : v)); };
    const ficha = fichaId != null ? dados?.lista.find((x) => x.id === fichaId) ?? null : null;
    const refNome = { criacao: "cadastro", falecimento: "falecimento", sepultamento: "sepultamento" }[ref];
    const campo = "rounded-lg border px-2 py-1.5 text-sm";
    const campoEstilo = { background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" } as const;

    if (erro?.tipo === "login" || erro?.tipo === "permissao") {
        return (
            <main className={`${nunito.className} flex min-h-screen items-center justify-center p-6`} style={{ background: "var(--dash-bg)" }}>
                <ThemeStyles />
                <div className="max-w-md rounded-2xl border p-6 text-center" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }}>
                    <h1 className="text-lg font-black">{erro.tipo === "login" ? "Sessão expirada" : "Acesso restrito"}</h1>
                    <p className="mt-2 text-sm" style={{ color: "var(--dash-text-soft)" }}>{erro.msg}</p>
                </div>
            </main>
        );
    }

    return (
        <main className={`${nunito.className} min-h-screen`} style={{ background: "var(--dash-bg)", color: "var(--dash-text)" }}>
            <ThemeStyles />
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
                <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black">Painel de Atendimentos</h1>
                        <p className="text-sm" style={{ color: "var(--dash-text-soft)" }}>{dataBR(range.inicio)} a {dataBR(range.fim)} · por data de {refNome}{dados ? ` · atualizado ${dataHoraBR(dados.gerado_em)}` : ""}</p>
                    </div>
                    <button type="button" onClick={carregar} disabled={carregando} className="rounded-lg border px-3 py-1.5 text-sm font-bold disabled:opacity-50" style={campoEstilo}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
                </header>

                <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-col gap-2 px-1 py-2 backdrop-blur" style={{ background: "color-mix(in srgb, var(--dash-bg) 90%, transparent)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex flex-wrap rounded-lg border p-0.5" style={campoEstilo}>
                            {PRESETS.map(([k, l]) => (
                                <button key={k} type="button" onClick={() => escolherPreset(k)} className="rounded-md px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                                    style={preset === k ? { background: "var(--dash-blue-dark)", color: "#fff" } : { color: "var(--dash-text-soft)" }}>{l}</button>))}
                        </div>
                        <input type="date" className={campo} style={campoEstilo} value={range.inicio} onChange={(e) => { if (!e.target.value) return; setPreset("custom"); setRange((r) => ({ inicio: e.target.value, fim: r.fim < e.target.value ? e.target.value : r.fim })); }} aria-label="Data inicial" />
                        <input type="date" className={campo} style={campoEstilo} value={range.fim} onChange={(e) => { if (!e.target.value) return; setPreset("custom"); setRange((r) => ({ inicio: r.inicio > e.target.value ? e.target.value : r.inicio, fim: e.target.value })); }} aria-label="Data final" />
                        <select className={campo} style={campoEstilo} value={ref} onChange={(e) => setRef(e.target.value as any)} aria-label="Data de referência">
                            <option value="criacao">Data de cadastro</option><option value="falecimento">Data de falecimento</option><option value="sepultamento">Data de sepultamento</option>
                        </select>
                        <select className={campo} style={campoEstilo} value={convenio} onChange={(e) => setConvenio(e.target.value)} aria-label="Convênio">
                            <option value="">Todos os convênios</option>{(dados?.opcoes.convenios ?? []).map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <select className={campo} style={campoEstilo} value={agente} onChange={(e) => setAgente(e.target.value)} aria-label="Agente que abriu">
                            <option value="">Todos os agentes</option>{(dados?.opcoes.agentes ?? []).map((c) => <option key={c}>{c}</option>)}
                        </select>
                        {(convenio || agente) && <button type="button" onClick={() => { setConvenio(""); setAgente(""); }} className="text-xs font-bold underline" style={{ color: "var(--dash-blue-dark)" }}>Limpar filtros</button>}
                    </div>
                    <nav className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--dash-border-light)" }} role="tablist">
                        {([["geral", "Visão geral"], ["equipe", "Desempenho da equipe"], ["perfil", "Perfil dos atendimentos"], ["lista", `Lista analítica${dados ? ` · ${dados.lista.length}` : ""}`]] as [Aba, string][]).map(([k, l]) => (
                            <button key={k} role="tab" aria-selected={aba === k} type="button" onClick={() => setAba(k)} className="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold"
                                style={{ borderColor: aba === k ? "var(--dash-blue-dark)" : "transparent", color: aba === k ? "var(--dash-text)" : "var(--dash-text-soft)" }}>{l}</button>))}
                    </nav>
                </div>

                {erro?.tipo === "falha" && (
                    <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ background: "var(--dash-danger-bg)", borderColor: "var(--dash-danger-border)", color: "var(--dash-danger-text)" }}>
                        {erro.msg} <button type="button" onClick={carregar} className="ml-2 font-bold underline">Tentar de novo</button>
                    </div>
                )}
                {!dados && carregando && <Vazio texto="Carregando o painel…" />}
                {dados && (
                    <div style={{ opacity: carregando ? 0.6 : 1, transition: "opacity .15s" }}>
                        {aba === "geral" && <AbaGeral d={dados} filtrar={filtrar} />}
                        {aba === "equipe" && <AbaEquipe d={dados} />}
                        {aba === "perfil" && <AbaPerfil d={dados} />}
                        {aba === "lista" && <AbaLista d={dados} abrir={setFichaId} />}
                    </div>
                )}
            </div>
            {ficha && dados && <Ficha item={ficha} etapasDef={dados.etapas_definicao ?? []} fechar={() => setFichaId(null)} />}
        </main>
    );
}
