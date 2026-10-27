"use client";

/**
 * Gestão do funil (27/10/2026) — rota /messenger-funil-gestao
 * Para a Gestão acompanhar as vendas do WhatsApp: funil e conversão no período, origem dos leads por canal (anúncio do
 * Facebook ou do Instagram, Instagram, Facebook, site, indicação, WhatsApp direto), desempenho por atendente (a Aurora
 * entra como uma linha: cards sem responsável que vieram de conversa), motivos de perda e leads parados.
 * Servidor: aurora_10.php (arquivo novo). Acesso: só a Gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_10.php`;

type Linha = { chave: string; nome: string; leads: number; andamento: number; fechados: number; perdidos: number; conversao: number | null; valor: number; dias_ate_fechar: number | null; minutos_ate_assumir: number | null; parados: number };
type Canal = { canal: string; nome: string; leads: number; fechados: number; perdidos: number; conversao: number | null; valor: number };
type Parado = { id: number; nome: string | null; telefone: string | null; etapa: string; plano: string | null; dias: number; proximo_contato: string | null; responsavel: string };
type Dados = {
    periodo: { de: string; ate: string; parados: number };
    resumo: { leads: number; fechados: number; perdidos: number; valor: number; conversao: number | null; dias_ate_fechar: number | null; parados: number };
    funil: { etapa: string; nome: string; qtd: number; da_anterior: number | null }[];
    canais: Canal[]; equipe: Linha[]; perdas: { motivo: string; qtd: number }[]; parados: Parado[]; tem_canal: boolean;
};

const ETAPAS: Record<string, string> = { novo: "Novo", em_conversa: "Em conversa", proposta: "Proposta enviada", ficha: "Ficha preenchida" };
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);
const num1 = (v: number | null, suf: string) => (v === null ? "—" : `${v.toLocaleString("pt-BR")} ${suf}`);
const minutos = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const fone = (t: string | null) => {
    const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : t || "";
};
const iso = (d: Date) => d.toLocaleDateString("sv-SE");
function periodo(tipo: string): [string, string] {
    const h = new Date();
    if (tipo === "mes_passado") return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
    if (tipo === "90") return [iso(new Date(h.getTime() - 89 * 86400000)), iso(h)];
    if (tipo === "ano") return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)];
    return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
}

const BTN = "inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-extrabold leading-none disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[#C9D1DE] bg-white dark:border-white/15 dark:bg-transparent`;
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "h-11 rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const TH = "whitespace-nowrap px-3 py-2 text-left text-[12.5px] font-extrabold uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]";
const TD = "whitespace-nowrap px-3 py-2 text-[14.5px]";

export default function FunilGestaoPage() {
    const [de, setDe] = useState(() => periodo("mes")[0]);
    const [ate, setAte] = useState(() => periodo("mes")[1]);
    const [parados, setParados] = useState(3);
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState("");
    const [carregando, setCarregando] = useState(false);

    const carregar = useCallback(async (d: string, a: string, p: number) => {
        setCarregando(true);
        setErro("");
        try {
            const u = new URL(API);
            u.searchParams.set("action", "gestao");
            u.searchParams.set("de", d);
            u.searchParams.set("ate", a);
            u.searchParams.set("parados", String(p));
            u.searchParams.set("_", String(Date.now()));
            const j = await apiJson(u.toString());
            setDados(j.dados as Dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar a gestão do funil.");
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        carregar(de, ate, parados);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function atalho(tipo: string) {
        const [d, a] = periodo(tipo);
        setDe(d);
        setAte(a);
        carregar(d, a, parados);
    }

    const r = dados?.resumo;
    const maxFunil = Math.max(1, ...(dados?.funil || []).map((f) => f.qtd));

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Gestão do funil</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Vendas do WhatsApp no período: de onde vieram os leads, quanto converteu e como está cada atendente (a Aurora conta como uma linha).</p>
                    </div>
                    <a className={BTN_SEC} href="/messenger-funil">Abrir o funil</a>
                </div>

                <div className={`${CARTAO} flex flex-wrap items-end gap-2`}>
                    {[["mes", "Este mês"], ["mes_passado", "Mês passado"], ["90", "90 dias"], ["ano", "Este ano"]].map(([k, n]) => (
                        <button key={k} type="button" className={BTN_SEC} onClick={() => atalho(k)}>{n}</button>
                    ))}
                    <label className="flex flex-col text-[13px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">De
                        <input type="date" className={CAMPO} value={de} onChange={(ev) => setDe(ev.target.value)} />
                    </label>
                    <label className="flex flex-col text-[13px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">Até
                        <input type="date" className={CAMPO} value={ate} onChange={(ev) => setAte(ev.target.value)} />
                    </label>
                    <label className="flex flex-col text-[13px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">Parado há mais de
                        <select className={CAMPO} value={parados} onChange={(ev) => setParados(Number(ev.target.value))}>
                            {[2, 3, 5, 7, 15, 30].map((n) => <option key={n} value={n}>{n} dias</option>)}
                        </select>
                    </label>
                    <button type="button" className={BTN_PRI} disabled={carregando} onClick={() => carregar(de, ate, parados)}>{carregando ? "Carregando…" : "Atualizar"}</button>
                </div>

                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {dados && !dados.tem_canal && <div className="rounded-xl border border-[#E4BC30] bg-[#FBF0C9] px-4 py-2 text-sm font-bold text-[#5C4600]">Falta rodar o SQL do canal (coluna canal em chat_funil): a origem aparece como "Outro" até lá.</div>}
                {!dados && !erro && <p className={CARTAO}>Carregando…</p>}

                {dados && r && (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {[["Leads no período", String(r.leads)], ["Fechados", String(r.fechados)], ["Conversão", pct(r.conversao)], ["Mensalidades fechadas", brl(r.valor)],
                              ["Tempo médio até fechar", num1(r.dias_ate_fechar, "dias")], ["Perdidos", String(r.perdidos)], [`Parados há +${dados.periodo.parados} dias`, String(r.parados)]].map(([n, v]) => (
                                <div key={n} className="min-w-[150px] flex-1 rounded-2xl bg-white px-4 py-3 dark:bg-[#232B3F]">
                                    <b className="block text-[20px]">{v}</b>
                                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{n}</span>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <section className={CARTAO}>
                                <h2 className="m-0 mb-3 text-[17px] font-extrabold">Funil do período</h2>
                                <p className="mt-0 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Leads que entraram no período e até onde chegaram. A porcentagem é a passagem da etapa anterior.</p>
                                <div className="flex flex-col gap-2">
                                    {dados.funil.map((f) => (
                                        <div key={f.etapa} className="flex items-center gap-3">
                                            <span className="w-[130px] shrink-0 text-[14px] font-bold">{f.nome}</span>
                                            <div className="h-8 min-w-0 flex-1 rounded-lg bg-[#F1F4F8] dark:bg-[#1C2334]">
                                                <div className="flex h-8 items-center rounded-lg bg-[#3D6A99] px-2 text-[13px] font-extrabold text-white" style={{ width: `${Math.max(8, (f.qtd / maxFunil) * 100)}%` }}>{f.qtd}</div>
                                            </div>
                                            <span className="w-[58px] shrink-0 text-right text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{f.da_anterior === null ? "" : pct(f.da_anterior)}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={CARTAO}>
                                <h2 className="m-0 mb-3 text-[17px] font-extrabold">Origem dos leads</h2>
                                {!dados.canais.length ? <p className="m-0 text-[14px]">Nenhum lead no período.</p> : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse">
                                            <thead><tr className="border-b border-[#E1E5EC] dark:border-white/12"><th className={TH}>Canal</th><th className={TH}>Leads</th><th className={TH}>Fechados</th><th className={TH}>Conversão</th><th className={TH}>Valor</th></tr></thead>
                                            <tbody>
                                                {dados.canais.map((c) => (
                                                    <tr key={c.canal} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/8">
                                                        <td className={`${TD} font-bold`}>{c.nome}</td><td className={TD}>{c.leads}</td><td className={TD}>{c.fechados}</td><td className={TD}>{pct(c.conversao)}</td><td className={TD}>{brl(c.valor)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </div>

                        <section className={CARTAO}>
                            <h2 className="m-0 mb-3 text-[17px] font-extrabold">Desempenho por atendente</h2>
                            {!dados.equipe.length ? <p className="m-0 text-[14px]">Nenhum lead no período.</p> : (
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-[#E1E5EC] dark:border-white/12">
                                                {["Quem", "Leads", "Em andamento", "Fechados", "Perdidos", "Conversão", "Valor fechado", "Dias até fechar", "Tempo até assumir", "Parados"].map((h) => <th key={h} className={TH}>{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dados.equipe.map((e) => (
                                                <tr key={e.chave} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/8">
                                                    <td className={`${TD} font-bold`}>{e.nome}</td><td className={TD}>{e.leads}</td><td className={TD}>{e.andamento}</td><td className={TD}>{e.fechados}</td>
                                                    <td className={TD}>{e.perdidos}</td><td className={TD}>{pct(e.conversao)}</td><td className={TD}>{brl(e.valor)}</td>
                                                    <td className={TD}>{num1(e.dias_ate_fechar, "dias")}</td><td className={TD}>{e.chave === "aurora" ? "na hora" : minutos(e.minutos_ate_assumir)}</td>
                                                    <td className={`${TD} ${e.parados > 0 ? "font-extrabold text-[#B42318] dark:text-[#FF9C92]" : ""}`}>{e.parados}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="mb-0 mt-2 text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">Tempo até assumir: média entre a conversa entrar na fila e o atendente assumir, nas conversas dos leads do período.</p>
                        </section>

                        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                            <section className={CARTAO}>
                                <h2 className="m-0 mb-3 text-[17px] font-extrabold">Motivos de perda</h2>
                                {!dados.perdas.length ? <p className="m-0 text-[14px]">Nenhuma perda no período.</p> : (
                                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                        {dados.perdas.map((p) => (
                                            <li key={p.motivo} className="flex items-start gap-2 text-[14.5px]">
                                                <span className="min-w-0 flex-1 break-words">{p.motivo}</span>
                                                <b className="shrink-0 rounded-full bg-[#F0F2F5] px-2 text-[13px] dark:bg-white/10">{p.qtd}</b>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section className={CARTAO}>
                                <h2 className="m-0 mb-3 text-[17px] font-extrabold">Leads parados há mais de {dados.periodo.parados} dias</h2>
                                {!dados.parados.length ? <p className="m-0 text-[14px]">Nenhum lead parado.</p> : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse">
                                            <thead><tr className="border-b border-[#E1E5EC] dark:border-white/12">{["Lead", "Etapa", "Parado", "Responsável", "Próximo contato"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                                            <tbody>
                                                {dados.parados.map((p) => (
                                                    <tr key={p.id} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/8">
                                                        <td className={TD}><b>{p.nome || fone(p.telefone) || "Sem nome"}</b>{p.plano ? ` · ${p.plano}` : ""}</td>
                                                        <td className={TD}>{ETAPAS[p.etapa] || p.etapa}</td><td className={TD}>{p.dias} dias</td><td className={TD}>{p.responsavel}</td>
                                                        <td className={TD}>{p.proximo_contato ? p.proximo_contato.split("-").reverse().join("/") : "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
