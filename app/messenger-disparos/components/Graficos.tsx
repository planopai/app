"use client";

/**
 * Gráficos do Painel de Campanhas e Lembretes (25/11/2026): linha pequena dos cartões, funil, barras por dia
 * (ou por hora, quando o período é um dia só) e rosca por modelo. Todos mostram os números de cada parte.
 * SVG puro, sem biblioteca; as cores vêm de quem chama.
 */
import React from "react";

export const CORES = {
    regua: "#94A3B8",
    enviadas: "#3B82F6",
    entregues: "#6366F1",
    lidas: "#10B981",
    abriu: "#14B8A6",
    pagos: "#D4A017",
    fila: "#F59E0B",
    nao: "#EF4444",
};
export const CORES_MODELOS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#14B8A6", "#EF4444", "#6366F1", "#0EA5E9", "#84CC16"];

const TXT = "fill-[#5B6478] dark:fill-[#AEB9CF]";
const TXT_FORTE = "fill-[#1F2937] dark:fill-white";

/** Linha pequena dos cartões (tendência no período). */
export function Linha({ valores, cor, largura = 84, altura = 30 }: { valores: number[]; cor: string; largura?: number; altura?: number }) {
    if (valores.length < 2) return null;
    const mx = Math.max(...valores, 1);
    const passo = largura / (valores.length - 1);
    const pts = valores.map((v, i) => [i * passo, altura - 3 - (v / mx) * (altura - 6)]);
    const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
    return (
        <svg width={largura} height={altura} aria-hidden className="shrink-0">
            <path d={`${d} L${largura},${altura} L0,${altura} Z`} fill={cor} opacity={0.12} />
            <path d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" />
        </svg>
    );
}

export type EtapaFunil = { chave: string | null; nome: string; valor: number; cor: string };

/** Funil: cada etapa com o número, a parte do total e a parte da etapa anterior. */
export function Funil({ etapas, ativas, clicar }: { etapas: EtapaFunil[]; ativas: string[]; clicar: (chave: string) => void }) {
    const topo = Math.max(etapas[0]?.valor || 0, 1);
    return (
        <div className="space-y-1.5">
            {etapas.map((e, i) => {
                const ant = i > 0 ? etapas[i - 1].valor : 0;
                const ativa = !!e.chave && ativas.includes(e.chave);
                const conteudo = (
                    <>
                        <span className="flex items-baseline gap-2 text-[13px]">
                            <span className="min-w-0 flex-1 truncate text-left font-bold">{e.nome}</span>
                            <b className="text-[15px]">{e.valor}</b>
                            <span className="whitespace-nowrap text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">
                                {i === 0 ? "100%" : `${pct(e.valor, topo)}${ant ? ` · ${pct(e.valor, ant)} da anterior` : ""}`}
                            </span>
                        </span>
                        <span className="relative mt-1 block h-3 overflow-hidden rounded-full bg-[#F1F4F8] dark:bg-white/5">
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max((e.valor / topo) * 100, e.valor ? 2 : 0)}%`, background: e.cor }} />
                        </span>
                    </>
                );
                return e.chave ? (
                    <button key={e.nome} type="button" aria-pressed={ativa} onClick={() => clicar(e.chave!)} title={`Filtrar: ${e.nome}`}
                        className={`block min-h-[40px] w-full rounded-lg px-2 py-1 hover:bg-[#F7F9FB] dark:hover:bg-white/5 ${ativa ? "ring-2 ring-[#F2CB3F]" : ""}`}>
                        {conteudo}
                    </button>
                ) : (
                    <div key={e.nome} className="min-h-[40px] w-full px-2 py-1">{conteudo}</div>
                );
            })}
        </div>
    );
}

export type Serie = { nome: string; cor: string };
export type Coluna = { rotulo: string; valores: number[] };

/** Barras empilhadas, com o número de cada parte dentro da barra (quando cabe) e o total em cima. */
export function Barras({ series, colunas }: { series: Serie[]; colunas: Coluna[] }) {
    const L = 640, A = 230, base = A - 22, topoY = 18;
    const mx = Math.max(...colunas.map((c) => c.valores.reduce((s, v) => s + v, 0)), 1);
    const passo = L / Math.max(colunas.length, 1);
    const larg = Math.min(passo * 0.62, 64);
    const mostrarRotulo = (i: number) => colunas.length <= 16 || i % Math.ceil(colunas.length / 16) === 0 || i === colunas.length - 1;
    return (
        <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Mensagens por período">
            {[0, 1, 2, 3].map((g) => {
                const y = topoY + ((base - topoY) * g) / 3;
                return <line key={g} x1={0} x2={L} y1={y} y2={y} className="stroke-[#E1E5EC] dark:stroke-white/10" strokeDasharray="3 4" />;
            })}
            {colunas.map((c, i) => {
                const x = i * passo + (passo - larg) / 2;
                const total = c.valores.reduce((s, v) => s + v, 0);
                let y = base;
                return (
                    <g key={c.rotulo + i}>
                        <title>{`${c.rotulo}: ${total} no total\n` + series.map((s, k) => `${s.nome}: ${c.valores[k]}`).join("\n")}</title>
                        {c.valores.map((v, k) => {
                            if (!v) return null;
                            const h = ((base - topoY) * v) / mx;
                            y -= h;
                            return (
                                <g key={k}>
                                    <rect x={x} y={y} width={larg} height={Math.max(h - 1, 0.5)} rx={2} fill={series[k].cor} />
                                    {h >= 13 && larg >= 16 && (
                                        <text x={x + larg / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">{v}</text>
                                    )}
                                </g>
                            );
                        })}
                        {total > 0 && <text x={x + larg / 2} y={y - 5} textAnchor="middle" fontSize={11.5} fontWeight={800} className={TXT_FORTE}>{total}</text>}
                        {mostrarRotulo(i) && <text x={x + larg / 2} y={A - 5} textAnchor="middle" fontSize={11} className={TXT}>{c.rotulo}</text>}
                    </g>
                );
            })}
        </svg>
    );
}

export type Fatia = { chave: string; nome: string; valor: number; cor: string };

/** Rosca por modelo, com o número em cada fatia (quando cabe) e a legenda com quantidade e parte do total. */
export function Rosca({ fatias, ativas, clicar }: { fatias: Fatia[]; ativas: string[]; clicar: (chave: string) => void }) {
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    const r = 62, esp = 22, cx = 84, cy = 84, circ = 2 * Math.PI * r;
    let acum = 0;
    return (
        <div className="flex flex-wrap items-center gap-4">
            <svg width={168} height={168} role="img" aria-label="Mensagens por modelo" className="shrink-0">
                <circle r={r} cx={cx} cy={cy} fill="none" strokeWidth={esp} className="stroke-[#F1F4F8] dark:stroke-white/10" />
                {total > 0 && fatias.map((f) => {
                    if (!f.valor) return null;
                    const comp = (circ * f.valor) / total;
                    const meio = ((acum + comp / 2) / circ) * 2 * Math.PI - Math.PI / 2;
                    const el = (
                        <g key={f.chave}>
                            <circle r={r} cx={cx} cy={cy} fill="none" stroke={f.cor} strokeWidth={esp}
                                strokeDasharray={`${Math.max(comp - (fatias.length > 1 ? 2 : 0), 0.5)} ${circ}`} strokeDashoffset={-acum}
                                transform={`rotate(-90 ${cx} ${cy})`}><title>{`${f.nome}: ${f.valor}`}</title></circle>
                            {f.valor / total >= 0.06 && (
                                <text x={cx + r * Math.cos(meio)} y={cy + r * Math.sin(meio) + 4} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#fff">{f.valor}</text>
                            )}
                        </g>
                    );
                    acum += comp;
                    return el;
                })}
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={26} fontWeight={800} className={TXT_FORTE}>{total}</text>
                <text x={cx} y={cy + 22} textAnchor="middle" fontSize={11} className={TXT}>mensagens</text>
            </svg>
            <div className="min-w-[180px] flex-1 space-y-1">
                {fatias.map((f) => {
                    const ativa = ativas.includes(f.chave);
                    return (
                        <button key={f.chave} type="button" aria-pressed={ativa} onClick={() => clicar(f.chave)} title={`Filtrar: ${f.nome}`}
                            className={`flex min-h-[32px] w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-[#F7F9FB] dark:hover:bg-white/5 ${ativa ? "ring-2 ring-[#F2CB3F]" : ""}`}>
                            <i className="inline-block h-[10px] w-[10px] shrink-0 rounded-[3px]" style={{ background: f.cor }} />
                            <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                            <b>{f.valor}</b>
                            <span className="w-10 text-right text-[#5B6478] dark:text-[#AEB9CF]">{pct(f.valor, total)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function pct(v: number, de: number) {
    if (!de) return "0%";
    const p = (v / de) * 100;
    return `${p > 0 && p < 1 ? p.toFixed(1).replace(".", ",") : Math.round(p)}%`;
}
