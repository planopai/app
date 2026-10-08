"use client";

/**
 * Padrão das telas de lista da OS (Financeiro da OS, Minhas OS, Relatório de OS) — prévia aprovada em 08/10/2026:
 *  - botão Filtros (com o número de filtros ativos) que abre a janela de filtros; seleção múltipla em Tipo, Situação,
 *    Agente e Convênio (campo "escreve e a lista filtra"); filtros ativos em etiquetas com ✕ logo abaixo;
 *  - botão Exportar: imprimir a lista, PDF (pela impressão do aparelho) e planilha (Excel), só a lista filtrada;
 *  - cartões compactos em grade (2 colunas no celular);
 *  - lista que cabe na largura da tela (sem rolagem para o lado) com o botão ⋮ (vertical) que abre o resumo da OS.
 * Também tem o PDF da folha da OS para mandar ao cliente (baixarPdfDaOS).
 */
import React, { useEffect, useMemo, useState } from "react";

export const API_OS = "https://api.planoassistencialintegrado.com.br/os_principal.php";

export const brlOS = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeISO = () => new Date().toLocaleDateString("sv-SE");
const dataCurta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const dataBROS = (s?: string | null) => (s ? new Date(String(s).replace(" ", "T")).toLocaleDateString("pt-BR") : "—");

/* ------------------------------------------------------------------ filtros */

export type FiltroOS = {
    data_inicio: string;
    data_fim: string;
    tipos: string[];
    situacoes: string[];
    agentes: string[];
    convenios: string[];
};
export type Opcao = { v: string; r: string };

export const TIPOS_OS: Opcao[] = [
    { v: "PRT", r: "Particular (Prt)" },
    { v: "SOC", r: "Associado (Soc)" },
    { v: "DIF_SOC", r: "Dif.Soc" },
    { v: "PRF", r: "Prefeitura (Prf)" },
    { v: "DIF_PRF", r: "Dif.Prf" },
    { v: "COR", r: "Coroa (Cor)" },
];
export const SITUACOES_OS: Opcao[] = [
    { v: "ABERTA", r: "Aberta" },
    { v: "AGUARDANDO_ASSINATURA", r: "Aguardando assinatura" },
    { v: "FECHADA", r: "Assinada" },
    { v: "PAGA", r: "Paga" },
    { v: "CONVERTIDA", r: "Convertida" },
];

export function filtroInicial(extra?: Partial<FiltroOS>): FiltroOS {
    const h = hojeISO();
    return { data_inicio: h.slice(0, 8) + "01", data_fim: h, tipos: [], situacoes: [], agentes: [], convenios: [], ...extra };
}

/** Parâmetros para o os_principal.php (vários valores separados por vírgula). */
export function paramsDoFiltro(f: FiltroOS): Record<string, string> {
    const p: Record<string, string> = { data_inicio: f.data_inicio, data_fim: f.data_fim };
    if (f.tipos.length) p.tipo = f.tipos.join(",");
    if (f.situacoes.length) p.situacao = f.situacoes.join(",");
    if (f.agentes.length) p.agente_id = f.agentes.join(",");
    if (f.convenios.length) p.convenio = f.convenios.join(",");
    return p;
}

type Mostrar = { tipo?: Opcao[]; situacao?: Opcao[]; agente?: Opcao[]; convenio?: Opcao[] };

/** Etiquetas dos filtros ativos (cada uma com o seu ✕). O período sempre aparece. */
function etiquetasAtivas(f: FiltroOS, m: Mostrar) {
    const nomes = (lista: string[], ops?: Opcao[]) => lista.map((v) => ops?.find((o) => o.v === v)?.r.replace(/\s*\(.*\)$/, "") || v).join(", ");
    const e: { chave: keyof FiltroOS | "periodo"; texto: string }[] = [
        { chave: "periodo", texto: `${dataCurta(f.data_inicio)} a ${dataCurta(f.data_fim)}` },
    ];
    if (f.tipos.length) e.push({ chave: "tipos", texto: `Tipo: ${nomes(f.tipos, m.tipo)}` });
    if (f.situacoes.length) e.push({ chave: "situacoes", texto: `Situação: ${nomes(f.situacoes, m.situacao)}` });
    if (f.agentes.length) e.push({ chave: "agentes", texto: `Agente: ${nomes(f.agentes, m.agente)}` });
    if (f.convenios.length) e.push({ chave: "convenios", texto: `Convênio: ${nomes(f.convenios, m.convenio)}` });
    return e;
}

const CARTAO = "rounded-[14px] border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const BOTAO =
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3.5 text-[15px] font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10";
const BOTAO_PRI =
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#313C55] px-4 text-[15px] font-bold text-white hover:bg-[#2A344B] disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#35608B]";
const MUTED = "text-[#5B6478] dark:text-[#AEB9CF]";

export const Ic = {
    filtro: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
    exportar: <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />,
    mais: (
        <>
            <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
        </>
    ),
    x: <path d="M6 6l12 12M18 6L6 18" />,
    imprimir: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
    pdf: <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4" />,
    planilha: <path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16" />,
    check: <path d="M5 12l5 5 9-10" />,
    busca: (
        <>
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4.5-4.5" />
        </>
    ),
    abrir: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};
export function Icone({ d, tam = 20 }: { d: React.ReactNode; tam?: number }) {
    return (
        <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            {d}
        </svg>
    );
}

/** Barra do topo da lista: Filtros (com contador) + Exportar + extras à direita; embaixo, as etiquetas dos filtros ativos. */
export function BarraFiltrosOS({
    filtro,
    mostrar,
    onAbrirFiltros,
    onMudar,
    exportar,
    extra,
}: {
    filtro: FiltroOS;
    mostrar: Mostrar;
    onAbrirFiltros: () => void;
    onMudar: (f: FiltroOS) => void;
    exportar?: ItemExportar[];
    extra?: React.ReactNode;
}) {
    const etiquetas = etiquetasAtivas(filtro, mostrar);
    const [menu, setMenu] = useState(false);
    const tirar = (chave: string) => {
        if (chave === "periodo") onMudar({ ...filtro, ...filtroInicial(), tipos: filtro.tipos, situacoes: filtro.situacoes, agentes: filtro.agentes, convenios: filtro.convenios });
        else onMudar({ ...filtro, [chave]: [] } as FiltroOS);
    };
    return (
        <div className="flex flex-col gap-2.5">
            <div className="relative flex items-center gap-2">
                <button type="button" className={BOTAO} onClick={onAbrirFiltros}>
                    <Icone d={Ic.filtro} />
                    Filtros
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#313C55] px-1.5 text-[11.5px] font-extrabold text-white dark:bg-[#3D6A99]">{etiquetas.length}</span>
                </button>
                {exportar && exportar.length ? (
                    <button type="button" className={BOTAO} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                        <Icone d={Ic.exportar} />
                        Exportar
                    </button>
                ) : null}
                <div className="flex-1" />
                {extra}
                {menu && exportar ? <MenuExportar itens={exportar} onFechar={() => setMenu(false)} /> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((e) => (
                    <span key={e.chave} className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-full bg-[#E9EFF6] pl-3 pr-0.5 text-[13px] font-bold text-[#313C55] dark:bg-[#3D6A99]/30 dark:text-white">
                        <span className="truncate">{e.texto}</span>
                        <button type="button" aria-label={`Tirar o filtro ${e.texto}`} onClick={() => tirar(e.chave)} className="flex size-[30px] shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                            <Icone d={Ic.x} tam={15} />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ janela de filtros */

function Chips({ opcoes, marcados, onTrocar }: { opcoes: Opcao[]; marcados: string[]; onTrocar: (v: string[]) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {opcoes.map((o) => {
                const on = marcados.includes(o.v);
                return (
                    <button
                        key={o.v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onTrocar(on ? marcados.filter((x) => x !== o.v) : [...marcados, o.v])}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-bold ${
                            on
                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/25 dark:bg-transparent dark:text-white"
                        }`}
                    >
                        {on ? <Icone d={Ic.check} tam={16} /> : null}
                        {o.r}
                    </button>
                );
            })}
        </div>
    );
}

/** Campo "escreve e a lista filtra", com seleção múltipla (os escolhidos ficam em etiquetas com ✕). */
function EscolhaComBusca({ opcoes, marcados, onTrocar, vazio }: { opcoes: Opcao[]; marcados: string[]; onTrocar: (v: string[]) => void; vazio: string }) {
    const [q, setQ] = useState("");
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const lista = opcoes.filter((o) => !marcados.includes(o.v) && (!q || norm(o.r).includes(norm(q)))).slice(0, 8);
    return (
        <div>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 dark:border-white/25 dark:bg-[#1C2334]">
                <Icone d={Ic.busca} tam={18} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={marcados.length ? "Acrescentar" : vazio} className="h-full w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none" />
            </label>
            {marcados.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {marcados.map((v) => (
                        <span key={v} className="inline-flex h-8 items-center gap-0.5 rounded-full bg-[#E9EFF6] pl-3 pr-0.5 text-[13px] font-bold dark:bg-[#3D6A99]/30">
                            {opcoes.find((o) => o.v === v)?.r || v}
                            <button type="button" aria-label="Tirar" onClick={() => onTrocar(marcados.filter((x) => x !== v))} className="flex size-[30px] items-center justify-center rounded-full">
                                <Icone d={Ic.x} tam={15} />
                            </button>
                        </span>
                    ))}
                </div>
            ) : null}
            {q || lista.length <= 6 ? (
                <div className="mt-1.5 flex flex-col">
                    {lista.map((o) => (
                        <button key={o.v} type="button" onClick={() => (onTrocar([...marcados, o.v]), setQ(""))} className="flex min-h-11 items-center rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                            {o.r}
                        </button>
                    ))}
                    {q && lista.length === 0 ? <span className={`px-2 py-2 text-sm ${MUTED}`}>Nada encontrado.</span> : null}
                </div>
            ) : null}
        </div>
    );
}

function periodo(atalho: string): [string, string] {
    const d = new Date();
    const iso = (x: Date) => x.toLocaleDateString("sv-SE");
    if (atalho === "hoje") return [iso(d), iso(d)];
    if (atalho === "7") {
        const i = new Date(d);
        i.setDate(i.getDate() - 6);
        return [iso(i), iso(d)];
    }
    if (atalho === "mes") return [iso(d).slice(0, 8) + "01", iso(d)];
    const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const fim = new Date(d.getFullYear(), d.getMonth(), 0);
    return [iso(ini), iso(fim)];
}

/** Janela de filtros (sobe de baixo no celular). O que se marca só vale ao tocar em "Aplicar filtros". */
export function JanelaFiltrosOS({ valor, mostrar, onAplicar, onFechar }: { valor: FiltroOS; mostrar: Mostrar; onAplicar: (f: FiltroOS) => void; onFechar: () => void }) {
    const [f, setF] = useState<FiltroOS>(valor);
    const atalhos: [string, string][] = [["hoje", "Hoje"], ["7", "7 dias"], ["mes", "Este mês"], ["passado", "Mês passado"]];
    const sec = "mb-2 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#5B6478] dark:text-[#AEB9CF]";
    const campoData = "h-11 w-full min-w-0 rounded-xl border border-[#C9D1DE] bg-white px-3 text-[15px] font-semibold dark:border-white/25 dark:bg-[#1C2334] dark:text-white";
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,14,24,0.55)] sm:items-center" onClick={onFechar} role="dialog" aria-modal="true" aria-label="Filtros">
            <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center border-b border-[#E3E8F0] py-2.5 pl-5 pr-2 dark:border-white/[0.12]">
                    <h2 className="flex-1 text-[19px] font-black">Filtros</h2>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex size-11 items-center justify-center rounded-xl">
                        <Icone d={Ic.x} tam={22} />
                    </button>
                </div>
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                    <section>
                        <div className={sec}>Período</div>
                        <div className="flex flex-wrap gap-2">
                            {atalhos.map(([k, r]) => {
                                const [a, b] = periodo(k);
                                const on = f.data_inicio === a && f.data_fim === b;
                                return (
                                    <button key={k} type="button" aria-pressed={on} onClick={() => setF({ ...f, data_inicio: a, data_fim: b })}
                                        className={`h-10 rounded-full border-[1.5px] px-3.5 text-sm font-bold ${on ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]" : "border-[#C9D1DE] dark:border-white/25"}`}>
                                        {r}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                            <input type="date" aria-label="De" className={campoData} value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} />
                            <input type="date" aria-label="Até" className={campoData} value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} />
                        </div>
                    </section>
                    {mostrar.tipo ? (
                        <section>
                            <div className={sec}>Tipo</div>
                            <Chips opcoes={mostrar.tipo} marcados={f.tipos} onTrocar={(v) => setF({ ...f, tipos: v })} />
                        </section>
                    ) : null}
                    {mostrar.situacao ? (
                        <section>
                            <div className={sec}>Situação</div>
                            <Chips opcoes={mostrar.situacao} marcados={f.situacoes} onTrocar={(v) => setF({ ...f, situacoes: v })} />
                        </section>
                    ) : null}
                    {mostrar.agente ? (
                        <section>
                            <div className={sec}>Agente</div>
                            <EscolhaComBusca opcoes={mostrar.agente} marcados={f.agentes} onTrocar={(v) => setF({ ...f, agentes: v })} vazio="Digite o nome" />
                        </section>
                    ) : null}
                    {mostrar.convenio ? (
                        <section>
                            <div className={sec}>Convênio</div>
                            <EscolhaComBusca opcoes={mostrar.convenio} marcados={f.convenios} onTrocar={(v) => setF({ ...f, convenios: v })} vazio="Todos" />
                        </section>
                    ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2.5 border-t border-[#E3E8F0] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12]">
                    <button type="button" className={BOTAO} onClick={() => setF(filtroInicial())}>Limpar filtros</button>
                    <button type="button" className={BOTAO_PRI} onClick={() => onAplicar(f)}>Aplicar filtros</button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ exportar */

export type ItemExportar = { icone: React.ReactNode; rotulo: string; sub?: string; onClick: () => void };

function MenuExportar({ itens, onFechar }: { itens: ItemExportar[]; onFechar: () => void }) {
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);
    return (
        <>
            <div className="fixed inset-0 z-40" data-pai-sem-folga onClick={onFechar} aria-hidden="true" />
            <div role="menu" className={`absolute left-0 right-0 top-12 z-50 p-1.5 shadow-2xl sm:left-auto sm:w-80 ${CARTAO}`}>
                {itens.map((i) => (
                    <button key={i.rotulo} type="button" role="menuitem" onClick={() => (onFechar(), i.onClick())} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                        <span className="flex size-[38px] items-center justify-center rounded-xl bg-[#E9EFF6] dark:bg-[#3D6A99]/30">{i.icone}</span>
                        <span className="flex flex-col">
                            <span className="text-[15px] font-bold">{i.rotulo}</span>
                            {i.sub ? <span className={`text-[12.5px] font-semibold ${MUTED}`}>{i.sub}</span> : null}
                        </span>
                    </button>
                ))}
            </div>
        </>
    );
}

export type TabelaExport = { titulo: string; subtitulo: string; cabecalho: string[]; linhas: (string | number)[][]; rodape?: string; arquivo: string };

/** Planilha (abre no Excel): CSV com ; e BOM, como o relatório do servidor. */
export function exportarPlanilha(t: TabelaExport) {
    const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [t.cabecalho.map(q).join(";"), ...t.linhas.map((l) => l.map(q).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.arquivo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Imprimir a lista (A4 deitado). O PDF sai pela mesma folha: na janela de impressão, "Salvar como PDF"
 * (no iPhone: Compartilhar → Imprimir → abrir a prévia e compartilhar como PDF).
 */
export function imprimirLista(t: TabelaExport, comoPdf = false) {
    const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const ultimaNumerica = (i: number) => /^(R\$|−|-)?\s?[\d.,]+$/.test(String(t.linhas[0]?.[i] ?? "").replace(/\u00a0/g, " ").replace("R$ ", "R$"));
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t.arquivo)}</title>
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Nunito,Helvetica,Arial,sans-serif;color:#313C55;font-size:11.5px;margin:0}
h1{font-size:18px;margin:0}.sub{color:#4A5468;margin:2px 0 10px}table{border-collapse:collapse;width:100%}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #313C55;padding:4px 6px}
td{border-bottom:1px solid #C9CFD9;padding:3px 6px;vertical-align:top}tr{break-inside:avoid}.d{text-align:right;white-space:nowrap}
.rod{text-align:right;font-weight:bold;font-size:14px;margin-top:8px}.faixa{display:flex;height:5px;margin-bottom:8px}
.faixa i{flex:40}.faixa i:nth-child(2){flex:25;background:#B3CE52}.faixa i:nth-child(3){flex:20;background:#F2CB3F}.faixa i:nth-child(4){flex:15;background:#3D6A99}.faixa i:first-child{background:#313C55}</style></head>
<body><div class="faixa"><i></i><i></i><i></i><i></i></div><h1>${esc(t.titulo)}</h1><div class="sub">${esc(t.subtitulo)}</div>
<table><thead><tr>${t.cabecalho.map((c, i) => `<th${ultimaNumerica(i) ? ' class="d"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${t.linhas.map((l) => `<tr>${l.map((v, i) => `<td${ultimaNumerica(i) ? ' class="d"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
${t.rodape ? `<div class="rod">${esc(t.rodape)}</div>` : ""}<div class="sub" style="margin-top:10px">Gerado pelo sistema PAI em ${esc(new Date().toLocaleString("pt-BR"))}${comoPdf ? " · para PDF, escolha “Salvar como PDF” na impressão" : ""}</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        return;
    }
    // Janela bloqueada: imprime por um quadro escondido na própria tela.
    const ifr = document.createElement("iframe");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(ifr);
    const d = ifr.contentWindow?.document;
    if (!d) return;
    d.open();
    d.write(html.replace(/<script>.*<\/script>/, ""));
    d.close();
    setTimeout(() => {
        ifr.contentWindow?.focus();
        ifr.contentWindow?.print();
        setTimeout(() => ifr.remove(), 4000);
    }, 400);
}

export function itensExportar(t: () => TabelaExport): ItemExportar[] {
    return [
        { icone: <Icone d={Ic.imprimir} />, rotulo: "Imprimir lista", sub: "A4 deitado", onClick: () => imprimirLista(t()) },
        { icone: <Icone d={Ic.pdf} />, rotulo: "PDF", sub: "pela impressão: Salvar como PDF", onClick: () => imprimirLista(t(), true) },
        { icone: <Icone d={Ic.planilha} />, rotulo: "Planilha (Excel)", sub: `${t().arquivo}.csv`, onClick: () => exportarPlanilha(t()) },
    ];
}

/* ------------------------------------------------------------------ PDF da folha da OS (para mandar ao cliente) */

/**
 * Gera o PDF da folha no servidor (fica registrado no histórico da OS, como a impressão) e entrega:
 * no celular, abre o Compartilhar do aparelho com o arquivo (WhatsApp, e-mail...); no computador, baixa.
 * Sem o gerador de PDF no servidor (resposta 501), abre a folha de impressão para "Salvar como PDF".
 */
export async function baixarPdfDaOS(osId: number | string, numero?: string): Promise<string> {
    const nome = `OS-${numero || osId}.pdf`;
    const imprimir = () => window.open(`${API_OS}?documento_os=1&os_id=${osId}&formato=impressao`, "_blank");
    let res: Response;
    try {
        res = await fetch(`${API_OS}?documento_os=1&os_id=${osId}&formato=pdf&_=${Date.now()}`, { credentials: "include", cache: "no-store" });
    } catch {
        imprimir();
        return "Sem conexão com o gerador de PDF: abri a folha para salvar como PDF pela impressão.";
    }
    const tipo = res.headers.get("Content-Type") || "";
    if (!res.ok || !tipo.includes("pdf")) {
        const j = await res.json().catch(() => null);
        if (res.status === 501 || !res.ok) {
            imprimir();
            return j?.msg ? `${j.msg}` : "Abri a folha para salvar como PDF pela impressão.";
        }
    }
    const blob = await res.blob();
    const arquivo = new File([blob], nome, { type: "application/pdf" });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [arquivo] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        try {
            await nav.share({ files: [arquivo], title: nome });
            return "";
        } catch (e: any) {
            if (e?.name === "AbortError") return "";
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return "";
}

/* ------------------------------------------------------------------ cartões, lista e resumo */

export type Cartao = { rotulo: string; valor: string; sub?: string; cor: string };

/** Cartões compactos: 2 por linha no celular, todos numa linha no computador (até 6). */
export function CartoesOS({ itens }: { itens: Cartao[] }) {
    const lg = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[Math.min(6, Math.max(2, itens.length))];
    return (
        <div className={`grid gap-2 ${itens.length === 3 ? "grid-cols-3" : "grid-cols-2"} ${lg}`}>
            {itens.map((k) => (
                <div key={k.rotulo} className={`min-w-0 px-3 py-2.5 ${CARTAO}`} style={{ borderTop: `3px solid ${k.cor}` }}>
                    <div className={`truncate text-[10.5px] font-extrabold uppercase tracking-[0.08em] ${MUTED}`}>{k.rotulo}</div>
                    <div className="mt-0.5 truncate text-lg font-black tabular-nums lg:text-[22px]">{k.valor}</div>
                    {k.sub ? <div className={`truncate text-[11.5px] ${MUTED}`}>{k.sub}</div> : null}
                </div>
            ))}
        </div>
    );
}

export type Situacao = { texto: string; tom: "amarelo" | "creme" | "verde" | "verdeCheio" | "neutro" };

export function situacaoDaOS(l: any): Situacao {
    if (l.status === "CONVERTIDA") return { texto: "Convertida", tom: "neutro" };
    if (l.status === "FECHADA") return l.status_pagamento === "PAGO" ? { texto: "Paga", tom: "verdeCheio" } : { texto: "Assinada", tom: "verde" };
    if (l.status === "AGUARDANDO_ASSINATURA") return { texto: "Aguard. assinatura", tom: "amarelo" };
    if (l.status === "CANCELADA") return { texto: "Cancelada", tom: "neutro" };
    return { texto: "Aberta", tom: "creme" };
}

const TOM: Record<Situacao["tom"], string> = {
    amarelo: "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
    creme: "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
    verde: "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-[#B3CE52]",
    verdeCheio: "bg-[#B3CE52] text-[#313C55]",
    neutro: "bg-[#EEF1F5] text-[#5B6478] dark:bg-white/10 dark:text-[#AEB9CF]",
};

export type LinhaLista = { chave: string | number; numero: string; situacao: Situacao; valor: string; nome: string; meta: string; destaque?: boolean };

/** Lista compacta: cabe na largura da tela. Toque na linha abre a OS; ⋮ abre o resumo. */
export function ListaCompactaOS({
    titulo,
    total,
    linhas,
    carregando,
    vazio,
    onAbrir,
    onMais,
}: {
    titulo: string;
    total?: string;
    linhas: LinhaLista[];
    carregando?: boolean;
    vazio: string;
    onAbrir?: (chave: LinhaLista["chave"]) => void;
    onMais: (chave: LinhaLista["chave"]) => void;
}) {
    return (
        <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className={`text-[11.5px] font-extrabold uppercase tracking-[0.1em] ${MUTED}`}>{carregando ? "Carregando…" : titulo}</h2>
                {total ? <span className={`text-[13px] font-bold tabular-nums ${MUTED}`}>{total}</span> : null}
            </div>
            <div className={`overflow-hidden ${CARTAO}`}>
                {!carregando && linhas.length === 0 ? <p className={`p-6 text-center text-sm ${MUTED}`}>{vazio}</p> : null}
                {linhas.map((l) => (
                    <div key={l.chave} className={`flex items-center gap-1 border-b border-[#E3E8F0] last:border-b-0 dark:border-white/[0.10] ${l.destaque ? "bg-[#FFFAE5] dark:bg-[#F2CB3F]/[0.06]" : ""}`}>
                        <button type="button" disabled={!onAbrir} onClick={() => onAbrir?.(l.chave)} className="min-w-0 flex-1 py-2.5 pl-3.5 text-left disabled:cursor-default lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
                            <span className="flex min-w-0 items-center justify-between gap-2 lg:justify-start">
                                <span className="flex min-w-0 items-center gap-2">
                                    <b className="whitespace-nowrap text-[15px]">{l.numero}</b>
                                    <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold ${TOM[l.situacao.tom]}`}>{l.situacao.texto}</span>
                                </span>
                                <b className="whitespace-nowrap text-[15px] tabular-nums lg:hidden">{l.valor}</b>
                            </span>
                            <span className="block min-w-0">
                                <span className="block truncate text-sm font-bold">{l.nome}</span>
                                <span className={`block truncate text-[12.5px] ${MUTED}`}>{l.meta}</span>
                            </span>
                            <b className="hidden whitespace-nowrap text-[15px] tabular-nums lg:block">{l.valor}</b>
                        </button>
                        <button type="button" aria-label={`Mais informações da OS ${l.numero}`} onClick={() => onMais(l.chave)} className={`flex h-11 w-8 shrink-0 items-center justify-center rounded-lg ${MUTED} hover:bg-black/5 dark:hover:bg-white/10`}>
                            <Icone d={Ic.mais} />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}

export type AcaoResumo = { rotulo: string; icone?: React.ReactNode; primaria?: boolean; onClick: () => void };

/** Resumo da OS pelo ⋮: janela que sobe de baixo, com os dados principais e as ações. */
export function ResumoOS({ numero, situacao, subtitulo, campos, acoes, aviso, onFechar }: {
    numero: string;
    situacao: Situacao;
    subtitulo?: string;
    campos: [string, React.ReactNode, boolean?][];
    acoes: AcaoResumo[];
    aviso?: string;
    onFechar: () => void;
}) {
    const sec = acoes.filter((a) => !a.primaria);
    const pri = acoes.filter((a) => a.primaria);
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,14,24,0.55)] sm:items-center" onClick={onFechar} role="dialog" aria-modal="true" aria-label={`Resumo da OS ${numero}`}>
            <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 text-[#313C55] dark:bg-[#232B3F] dark:text-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xl font-black">{numero}</span>
                            <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-extrabold ${TOM[situacao.tom]}`}>{situacao.texto}</span>
                        </div>
                        {subtitulo ? <div className={`mt-0.5 text-sm ${MUTED}`}>{subtitulo}</div> : null}
                    </div>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex size-11 items-center justify-center rounded-xl">
                        <Icone d={Ic.x} tam={22} />
                    </button>
                </div>
                <dl className="mt-2">
                    {campos.map(([k, v, forte]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-[#E3E8F0] py-2.5 last:border-b-0 dark:border-white/[0.10]">
                            <dt className={`text-sm ${MUTED}`}>{k}</dt>
                            <dd className={`text-right text-sm ${forte ? "font-black" : "font-bold"}`}>{v}</dd>
                        </div>
                    ))}
                </dl>
                {aviso ? <p className="mt-2 rounded-xl bg-[#FCF3CC] px-3 py-2 text-sm font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">{aviso}</p> : null}
                {sec.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                        {sec.map((a) => (
                            <button key={a.rotulo} type="button" className={BOTAO} onClick={a.onClick}>
                                {a.icone}
                                {a.rotulo}
                            </button>
                        ))}
                    </div>
                ) : null}
                {pri.map((a) => (
                    <button key={a.rotulo} type="button" className={`${BOTAO_PRI} mt-2.5 h-12 w-full`} onClick={a.onClick}>
                        {a.icone}
                        {a.rotulo}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Opções de agente tiradas das próprias linhas (id → nome). Guarda os já vistos, para a lista não encolher ao filtrar. */
export function useOpcoesAgente(linhas: any[] | undefined): Opcao[] {
    const vistos = React.useRef(new Map<string, string>());
    return useMemo(() => {
        const m = vistos.current;
        (linhas || []).forEach((l: any) => {
            if (l.agente_id) m.set(String(l.agente_id), l.agente || `#${l.agente_id}`);
        });
        return Array.from(m.entries())
            .map(([v, r]) => ({ v, r }))
            .sort((a, b) => a.r.localeCompare(b.r, "pt-BR"));
    }, [linhas]);
}
