"use client";

/**
 * Relatórios da OS (16/10/2026) — mockup "Relatórios da OS (prévia)":
 *  - JanelaRelatorios: o botão "Relatórios" do Painel Financeiro abre esta janela; escolhe o período e o relatório
 *    e abre a página /os/relatorio?relatorio=<tipo> (a mesma página de antes, página "administrativo").
 *  - Nomes: Relatório Particular - Cálculo de Bônus | Relatório Particular - Completo |
 *           Relatório Prefeitura - Prestação de Contas | Relatório Sócio - Acompanhamento.
 *  - imprimirRelatorio: folha A4 deitada com o resumo e várias tabelas (o PDF sai pela impressão: "Salvar como PDF"),
 *    células centralizadas na vertical; exportarPlanilhaRelatorio: as mesmas tabelas num .csv.
 */
import React, { useState } from "react";
import { CartoesOS, Ic, Icone, ListaCompactaOS, type FiltroOS, type ItemExportar, type Situacao } from "./ListaOS";

export type TipoRelatorio = "bonus" | "completo" | "prefeitura" | "socio" | "coroas" | "pendencias";

export const RELATORIOS: { tipo: TipoRelatorio; grupo: string; titulo: string; sub: string; nome: string; secao: string }[] = [
    { tipo: "bonus", grupo: "Particular", titulo: "Cálculo de Bônus", sub: "Particular, Dif e Coroa sem translado", nome: "Relatório Particular", secao: "Cálculo de Bônus" },
    { tipo: "completo", grupo: "Particular", titulo: "Completo", sub: "Valores, descontos e recebimentos", nome: "Relatório Particular", secao: "Completo" },
    { tipo: "prefeitura", grupo: "Convênios", titulo: "Prefeitura", sub: "Prestação de Contas", nome: "Relatório Prefeitura", secao: "Prestação de Contas" },
    { tipo: "socio", grupo: "Convênios", titulo: "Sócio", sub: "Acompanhamento", nome: "Relatório Sócio", secao: "Acompanhamento" },
    // 19/10/2026: sem segundo nome (o usuário tirou "Por Origem" e "Em Aberto")
    { tipo: "coroas", grupo: "Outros", titulo: "Coroas", sub: "Naturais, artificiais e custos", nome: "Relatório Coroas", secao: "" },
    { tipo: "pendencias", grupo: "Outros", titulo: "Pendências", sub: "Situação de hoje", nome: "Relatório Pendências", secao: "" },
];

export const tipoRelatorioValido = (t: string | null | undefined): TipoRelatorio =>
    (RELATORIOS.find((r) => r.tipo === t)?.tipo || "bonus") as TipoRelatorio;

export const infoRelatorio = (t: TipoRelatorio) => RELATORIOS.find((r) => r.tipo === t) || RELATORIOS[0];

/** "Relatório Particular - Cálculo de Bônus" */
export const nomeCompletoRelatorio = (t: TipoRelatorio) => (infoRelatorio(t).secao ? `${infoRelatorio(t).nome} - ${infoRelatorio(t).secao}` : infoRelatorio(t).nome);

export function urlRelatorio(t: TipoRelatorio, inicio?: string, fim?: string) {
    const p = new URLSearchParams({ relatorio: t });
    if (inicio) p.set("data_inicio", inicio);
    if (fim) p.set("data_fim", fim);
    return `/os/relatorio?${p.toString()}`;
}

const MUTED = "text-[#5B6478] dark:text-[#AEB9CF]";
const CARTAO = "rounded-[14px] border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";

const ICONES: Record<TipoRelatorio, React.ReactNode> = {
    bonus: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
    completo: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 15h6M10 18h4" />,
    prefeitura: <path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6M3 21h18" />,
    socio: (
        <>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
        </>
    ),
    coroas: (
        <>
            <circle cx="12" cy="12" r="2.5" />
            <circle cx="12" cy="6.5" r="3" />
            <circle cx="17.5" cy="12" r="3" />
            <circle cx="12" cy="17.5" r="3" />
            <circle cx="6.5" cy="12" r="3" />
        </>
    ),
    pendencias: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3 2" />
        </>
    ),
};

/** Janela de seleção (sobe de baixo no celular). O período vem do filtro da tela que abriu. */
export function JanelaRelatorios({ filtro, atual, onFechar }: { filtro?: Pick<FiltroOS, "data_inicio" | "data_fim">; atual?: TipoRelatorio; onFechar: () => void }) {
    const [ini, setIni] = useState(filtro?.data_inicio || "");
    const [fim, setFim] = useState(filtro?.data_fim || "");
    const campoData = "h-11 w-full min-w-0 rounded-xl border border-[#C9D1DE] bg-white px-3 text-base font-semibold dark:border-white/25 dark:bg-[#1C2334] dark:text-white";
    const grupos = Array.from(new Set(RELATORIOS.map((r) => r.grupo)));
    return (
        <div data-pai-overlay className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,14,24,0.55)] sm:items-center" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Relatórios" className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center border-b border-[#E3E8F0] py-2.5 pl-5 pr-2 dark:border-white/[0.12]">
                    <h2 className="flex-1 text-[19px] font-black">Relatórios</h2>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex size-11 items-center justify-center rounded-xl">
                        <Icone d={Ic.x} tam={22} />
                    </button>
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
                    <section>
                        <div className={`mb-2 text-[11.5px] font-extrabold uppercase tracking-[0.1em] ${MUTED}`}>Período</div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" aria-label="De" className={campoData} value={ini} onChange={(e) => setIni(e.target.value)} />
                            <input type="date" aria-label="Até" className={campoData} value={fim} onChange={(e) => setFim(e.target.value)} />
                        </div>
                    </section>
                    {grupos.map((g) => (
                        <section key={g} className="flex flex-col gap-2">
                            <div className={`text-[11.5px] font-extrabold uppercase tracking-[0.1em] ${MUTED}`}>{g}</div>
                            {RELATORIOS.filter((r) => r.grupo === g).map((r) => (
                                <a
                                    key={r.tipo}
                                    href={urlRelatorio(r.tipo, ini, fim)}
                                    aria-current={atual === r.tipo ? "page" : undefined}
                                    className={`flex min-h-[60px] items-center gap-3 px-3 py-2.5 hover:bg-[#EEF2F7] dark:hover:bg-white/10 ${CARTAO} ${atual === r.tipo ? "ring-2 ring-[#F2CB3F]" : ""}`}
                                >
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E9EFF6] dark:bg-[#3D6A99]/30">
                                        <Icone d={ICONES[r.tipo]} tam={22} />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[15px] font-extrabold">{r.titulo}</span>
                                        <span className={`truncate text-[12.5px] font-semibold ${MUTED}`}>{r.sub}</span>
                                    </span>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${MUTED}`}>
                                        <path d="M9 5l7 7-7 7" />
                                    </svg>
                                </a>
                            ))}
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Abas em botões (Cálculo de Bônus | Completo; Resumo | Atendimentos | Translados). */
export function AbasRelatorio<T extends string>({ opcoes, valor, onTrocar }: { opcoes: [T, string][]; valor: T; onTrocar: (v: T) => void }) {
    return (
        <div role="tablist" className="grid gap-1 rounded-[14px] border border-[#E3E8F0] bg-white p-1 dark:border-white/[0.12] dark:bg-[#1C2334]" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
            {opcoes.map(([v, r]) => (
                <button key={v} type="button" role="tab" aria-selected={valor === v} onClick={() => onTrocar(v)}
                    className={`h-9 truncate rounded-[10px] px-2 text-[13.5px] font-extrabold ${valor === v ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : MUTED}`}>
                    {r}
                </button>
            ))}
        </div>
    );
}

/** Bloco com título e linhas "rótulo … valor" (cabe na largura do celular). */
export function BlocoRelatorio({ titulo, direita, linhas }: { titulo: string; direita?: string; linhas: { rotulo: React.ReactNode; sub?: React.ReactNode; valor: React.ReactNode }[] }) {
    return (
        <section className={`overflow-hidden ${CARTAO}`}>
            <div className="flex items-baseline justify-between gap-2 border-b border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.10]">
                <h2 className={`text-[11.5px] font-extrabold uppercase tracking-[0.1em] ${MUTED}`}>{titulo}</h2>
                {direita ? <span className={`text-[11.5px] font-extrabold uppercase tracking-[0.1em] ${MUTED}`}>{direita}</span> : null}
            </div>
            {linhas.length === 0 ? <p className={`p-4 text-center text-sm ${MUTED}`}>Nada no período.</p> : null}
            {linhas.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-[#E3E8F0] px-3.5 py-2 last:border-b-0 dark:border-white/[0.10]">
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{l.rotulo}</span>
                        {l.sub ? <span className={`block truncate text-[12.5px] ${MUTED}`}>{l.sub}</span> : null}
                    </span>
                    <span className="shrink-0 text-right text-sm font-extrabold tabular-nums">{l.valor}</span>
                </div>
            ))}
        </section>
    );
}

/* ------------------------------------------------------------------ impressão e planilha */

export type SecaoImpressao = {
    titulo: string;
    cabecalho: string[];
    linhas: (string | number)[][];
    /** índices das colunas de número (alinhadas à direita) */
    numericas?: number[];
    rodape?: (string | number)[];
    /** começa numa folha nova */
    novaFolha?: boolean;
    /** largura máxima da tabela (ex.: "560px"), para tabelas pequenas */
    largura?: string;
};
export type DocRelatorio = {
    titulo: string;
    subtitulo: string;
    resumo?: [string, string, string?][];
    secoes: SecaoImpressao[];
    assinaturas?: string[];
    arquivo: string;
};

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Folha A4 deitada. O PDF sai pela mesma folha: na janela de impressão, "Salvar como PDF". */
export function imprimirRelatorio(d: DocRelatorio, comoPdf = false) {
    const tabela = (s: SecaoImpressao) => {
        const n = new Set(s.numericas || []);
        const cel = (v: any, i: number, tag = "td") => `<${tag}${n.has(i) ? ' class="d"' : ""}>${esc(v)}</${tag}>`;
        return `<section${s.novaFolha ? ' class="nova"' : ""}><h2>${esc(s.titulo)}</h2><table${s.largura ? ` style="max-width:${esc(s.largura)}"` : ""}>
<thead><tr>${s.cabecalho.map((c, i) => cel(c, i, "th")).join("")}</tr></thead>
<tbody>${s.linhas.map((l) => `<tr>${l.map((v, i) => cel(v, i)).join("")}</tr>`).join("")}</tbody>
${s.rodape ? `<tfoot><tr>${s.rodape.map((v, i) => cel(v, i)).join("")}</tr></tfoot>` : ""}</table></section>`;
    };
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.arquivo)}</title>
<style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Nunito,Helvetica,Arial,sans-serif;color:#1F2638;font-size:11.5px;margin:0}
.faixa{display:flex;height:5px;margin-bottom:8px}.faixa i{flex:40}.faixa i:first-child{background:#313C55}.faixa i:nth-child(2){flex:25;background:#B3CE52}.faixa i:nth-child(3){flex:20;background:#F2CB3F}.faixa i:nth-child(4){flex:15;background:#3D6A99}
h1{font-size:19px;margin:0;color:#313C55}.sub{color:#4A5468;margin:2px 0 10px;font-weight:700}
.res{display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(6, d.resumo?.length || 1))},minmax(0,1fr));gap:8px;margin-bottom:10px}
.rb{border:1px solid #C9D0DC;border-radius:8px;padding:6px 10px;display:flex;flex-direction:column;justify-content:center}
.rb b{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#4A5468}.rb span{font-size:15px;font-weight:900;color:#313C55}.rb small{font-size:10.5px;color:#4A5468}
section{margin-top:10px}section.nova{break-before:page}h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.1em;color:#313C55;margin:0 0 4px}
table{border-collapse:collapse;width:100%}th{text-align:left;font-size:10.5px;background:#313C55;color:#fff;padding:5px 6px;vertical-align:middle}
td{border-bottom:1px solid #D5DAE3;padding:4px 6px;vertical-align:middle}tbody tr:nth-child(even) td{background:#F3F5F9}tr{break-inside:avoid}
.d{text-align:right;white-space:nowrap}tfoot td{font-weight:900;color:#313C55;border-top:2px solid #313C55;border-bottom:0}
.ass{display:grid;grid-template-columns:repeat(${Math.max(1, d.assinaturas?.length || 1)},minmax(0,1fr));gap:48px;margin-top:48px;break-inside:avoid}.ass div{border-top:1px solid #313C55;padding-top:5px;text-align:center;font-weight:700;color:#313C55}
.gerado{color:#4A5468;margin-top:10px}</style></head>
<body><div class="faixa"><i></i><i></i><i></i><i></i></div><h1>${esc(d.titulo)}</h1><div class="sub">${esc(d.subtitulo)}</div>
${d.resumo?.length ? `<div class="res">${d.resumo.map(([r, v, s]) => `<div class="rb"><b>${esc(r)}</b><span>${esc(v)}</span>${s ? `<small>${esc(s)}</small>` : ""}</div>`).join("")}</div>` : ""}
${d.secoes.map(tabela).join("")}
${d.assinaturas?.length ? `<div class="ass">${d.assinaturas.map((a) => `<div>${esc(a)}</div>`).join("")}</div>` : ""}
<div class="gerado">Gerado pelo sistema PAI em ${esc(new Date().toLocaleString("pt-BR"))}${comoPdf ? " · para PDF, escolha “Salvar como PDF” na impressão" : ""}</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        return;
    }
    // Janela bloqueada: imprime por um quadro escondido na própria tela (mesmo jeito do imprimirLista).
    const ifr = document.createElement("iframe");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(ifr);
    const doc = ifr.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html.replace(/<script>.*<\/script>/, ""));
    doc.close();
    setTimeout(() => {
        ifr.contentWindow?.focus();
        ifr.contentWindow?.print();
        setTimeout(() => ifr.remove(), 4000);
    }, 400);
}

/** Planilha (abre no Excel): as tabelas do relatório uma embaixo da outra, com uma linha em branco entre elas. */
export function exportarPlanilhaRelatorio(d: DocRelatorio) {
    const q = (v: any) => {
        let t = String(v ?? "");
        if (/^[=+@\t\r]/.test(t)) t = "'" + t;   // injeção de CSV
        return `"${t.replace(/"/g, '""')}"`;
    };
    const linhas: string[] = [q(d.titulo), q(d.subtitulo), ""];
    d.secoes.forEach((s) => {
        linhas.push(q(s.titulo), s.cabecalho.map(q).join(";"), ...s.linhas.map((l) => l.map(q).join(";")));
        if (s.rodape) linhas.push(s.rodape.map(q).join(";"));
        linhas.push("");
    });
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.arquivo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function itensExportarRelatorio(d: () => DocRelatorio): ItemExportar[] {
    return [
        { icone: <Icone d={Ic.imprimir} />, rotulo: "Imprimir", sub: "A4 deitado", onClick: () => imprimirRelatorio(d()) },
        { icone: <Icone d={Ic.pdf} />, rotulo: "PDF", sub: "pela impressão: Salvar como PDF", onClick: () => imprimirRelatorio(d(), true) },
        { icone: <Icone d={Ic.planilha} />, rotulo: "Planilha (Excel)", sub: "arquivo .csv", onClick: () => exportarPlanilhaRelatorio(d()) },
    ];
}

/* ------------------------------------------------------------------ Relatório Pendências (19/10/2026) */

const brlR = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Dias parada: até 2 neutro, de 3 a 7 amarelo, mais de 7 vermelho (como no mockup). */
export function situacaoDias(d: number | null | undefined): Situacao {
    if (d === null || d === undefined) return { texto: "—", tom: "neutro" };
    return { texto: `${d} ${d === 1 ? "dia" : "dias"}`, tom: d > 7 ? "vermelho" : d >= 3 ? "amarelo" : "neutro" };
}

/**
 * Pendências (situação de hoje): cartões e as listas por tipo, ou o total por agente.
 * Usada no Relatório Pendências (Financeiro: todas) e em Minhas OS (só as do agente: mostrarAgente=false).
 */
export function PendenciasOS({ dados, carregando, vista, mostrarAgente = true, onAbrir }: {
    dados: any; carregando?: boolean; vista: "tipo" | "agente"; mostrarAgente?: boolean; onAbrir?: (osId: number, numero: string) => void;
}) {
    const g = dados?.total_geral || {};
    const grupos: any[] = dados?.grupos || [];
    const qtd = (cod: string) => grupos.find((x) => x.codigo === cod)?.quantidade || 0;
    const devolver = qtd("NP_DEVOLVER") + qtd("CREDITO_DEVOLVER");
    const comItens = grupos.filter((x) => x.quantidade > 0);
    const abrir = (grp: any, ch: string | number) => {
        const it = grp.itens[Number(String(ch).split("-").pop())];
        if (it && onAbrir) onAbrir(it.os_id, it.numero_os);
    };
    return (
        <>
            {dados && (
                <CartoesOS itens={[
                    { rotulo: "Pendências", valor: String(g.quantidade || 0), cor: "#313C55", sub: g.quantidade ? `mais antiga: ${g.mais_antiga || 0} ${g.mais_antiga === 1 ? "dia" : "dias"}` : "nada em aberto" },
                    { rotulo: "A receber", valor: brlR(g.a_receber), cor: "#F2CB3F", sub: `${g.a_receber_os || 0} OS${g.a_receber_com_np ? ` · ${g.a_receber_com_np} com NP` : ""}` },
                    { rotulo: "Sem assinatura", valor: String(qtd("SEM_ASSINATURA")), cor: "#3D6A99", sub: "vendas concluídas" },
                    { rotulo: "A devolver", valor: String(devolver), cor: "#B3CE52", sub: `${qtd("NP_DEVOLVER")} NP · ${qtd("CREDITO_DEVOLVER")} crédito` },
                ]} />
            )}
            {vista === "agente" && dados ? (
                <BlocoRelatorio titulo="Por agente" direita="Pend. · A receber" linhas={(dados.por_agente || []).map((a: any) => ({
                    rotulo: a.agente || "—", valor: `${a.quantidade} · ${a.a_receber > 0 ? brlR(a.a_receber) : "—"}`,
                }))} />
            ) : null}
            {vista === "tipo" && dados && !comItens.length ? <BlocoRelatorio titulo="Pendências" linhas={[]} /> : null}
            {vista === "tipo" && !dados && carregando ? <ListaCompactaOS titulo="Pendências" linhas={[]} carregando vazio="" onMais={() => undefined} /> : null}
            {vista === "tipo"
                ? comItens.map((grp) => (
                    <ListaCompactaOS
                        key={grp.codigo}
                        titulo={`${grp.titulo} · ${grp.quantidade}`}
                        total={brlR(grp.total)}
                        carregando={carregando}
                        vazio=""
                        linhas={grp.itens.map((it: any, i: number) => ({
                            chave: `${it.os_id}-${i}`, numero: it.numero_os, situacao: situacaoDias(it.dias), valor: brlR(it.valor), nome: it.falecido || "—",
                            meta: [mostrarAgente ? it.agente : "", it.detalhe].filter(Boolean).join(" · "), destaque: (it.dias ?? 0) > 7,
                        }))}
                        onAbrir={onAbrir ? (ch) => abrir(grp, ch) : undefined}
                        onMais={(ch) => abrir(grp, ch)}
                    />
                ))
                : null}
        </>
    );
}

/** Folha A4 deitada das Pendências: uma tabela por tipo e o total por agente. */
export function docPendencias(dados: any, mostrarAgente = true, titulo = "Relatório Pendências"): DocRelatorio {
    const g = dados?.total_geral || {};
    const grupos: any[] = (dados?.grupos || []).filter((x: any) => x.quantidade > 0);
    const hoje = dados?.data ? new Date(dados.data + "T12:00").toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
    const qtd = (cod: string) => (dados?.grupos || []).find((x: any) => x.codigo === cod)?.quantidade || 0;
    const secoes: SecaoImpressao[] = grupos.map((grp) => ({
        titulo: `${grp.titulo} · ${grp.quantidade}`,
        numericas: mostrarAgente ? [4, 5] : [3, 4],
        cabecalho: mostrarAgente ? ["OS", "Falecido", "Agente", "Situação", "Valor", "Dias"] : ["OS", "Falecido", "Situação", "Valor", "Dias"],
        linhas: grp.itens.map((it: any) => (mostrarAgente
            ? [it.numero_os, it.falecido || "—", it.agente || "—", it.detalhe, brlR(it.valor), it.dias ?? "—"]
            : [it.numero_os, it.falecido || "—", it.detalhe, brlR(it.valor), it.dias ?? "—"])),
        rodape: mostrarAgente ? ["Total", "", "", "", brlR(grp.total), ""] : ["Total", "", "", brlR(grp.total), ""],
    }));
    if (mostrarAgente && (dados?.por_agente || []).length) {
        secoes.push({
            titulo: "Por agente", numericas: [1, 2], largura: "520px", cabecalho: ["Agente", "Pendências", "A receber"],
            linhas: dados.por_agente.map((a: any) => [a.agente || "—", a.quantidade, a.a_receber > 0 ? brlR(a.a_receber) : "—"]),
            rodape: ["Total", g.quantidade || 0, brlR(g.a_receber)],
        });
    }
    return {
        titulo, subtitulo: `Situação em ${hoje} · todas as OS em aberto`, arquivo: `relatorio-pendencias-${dados?.data || ""}`,
        resumo: [["Pendências", String(g.quantidade || 0), `mais antiga: ${g.mais_antiga || 0} dias`], ["Vendas não concluídas", String(qtd("VENDA_ABERTA"))],
            ["Sem assinatura", String(qtd("SEM_ASSINATURA"))], ["A receber", brlR(g.a_receber), `${g.a_receber_os || 0} OS`],
            ["A devolver", String(qtd("NP_DEVOLVER") + qtd("CREDITO_DEVOLVER")), `${qtd("NP_DEVOLVER")} NP · ${qtd("CREDITO_DEVOLVER")} crédito`],
            ["Prefeitura em aberto", String(qtd("PREFEITURA_ABERTA"))]],
        secoes,
    };
}
