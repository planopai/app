"use client";

/**
 * Valor oficial da Meta (27/10/2026) — quadro da tela Monitoramento do atendimento.
 * Mostra o que a Meta registrou como cobrado na conta do WhatsApp Business no período (pricing_analytics), por categoria,
 * ao lado da estimativa que a tela já calcula mensagem a mensagem. Só a Gestão. Servidor: aurora_05.php.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

type Categoria = { categoria: string; mensagens: number; cobradas: number; gratis: number; custo: number };
type Custo = {
    de: string; ate: string; moeda: string; categorias: Categoria[]; total: number; mensagens: number;
    por_dia: { dia: string; custo: number }[]; consultado_em: string; guardado: boolean;
};

const NOMES: Record<string, string> = { marketing: "Marketing", utility: "Utilidade", authentication: "Autenticação", service: "Atendimento", outros: "Outros" };
const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const rotuloTabela = "px-3 py-2 text-left text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";

export default function CustoMetaOficial({ de, ate, nomePeriodo, estimativa }: { de: string; ate: string; nomePeriodo: string; estimativa?: number }) {
    const [d, setD] = useState<Custo | null>(null);
    const [erro, setErro] = useState("");
    const [carregando, setCarregando] = useState(false);

    const carregar = useCallback(async (atualizar = false) => {
        setCarregando(true);
        setErro("");
        try {
            const u = new URL(`${API_BASE}/aurora_05.php`);
            u.searchParams.set("action", "custo_meta");
            u.searchParams.set("de", de);
            u.searchParams.set("ate", ate);
            if (atualizar) u.searchParams.set("atualizar", "1");
            u.searchParams.set("_", String(Date.now()));
            const j = await apiJson(u.toString(), undefined, false);
            setD(j.dados as Custo);
        } catch (e: any) {
            setD(null);
            setErro(e?.status === 403 ? "" : e?.message || "Não foi possível consultar a Meta.");
        } finally {
            setCarregando(false);
        }
    }, [de, ate]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const moeda = d?.moeda || "BRL";
    const valor = (v: number) => {
        try {
            return v.toLocaleString("pt-BR", { style: "currency", currency: moeda, minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 1 ? 4 : 2 });
        } catch {
            return `${moeda} ${v.toFixed(2)}`;
        }
    };
    const maiorDia = Math.max(0.0001, ...(d?.por_dia || []).map((x) => x.custo));

    if (!d && !erro && !carregando) return null;

    return (
        <section aria-label="Valor oficial da Meta" className={cartao}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="m-0 flex-1 text-[17px] font-extrabold">Valor oficial da Meta · {nomePeriodo}</h2>
                <button type="button" onClick={() => carregar(true)} disabled={carregando}
                    className="h-10 rounded-xl border border-[#C9D1DE] bg-white px-3 text-[14px] font-extrabold disabled:opacity-50 dark:border-white/15 dark:bg-transparent">
                    {carregando ? "Consultando…" : "Atualizar"}
                </button>
            </div>
            <p className="mt-0 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">O que a Meta registrou como cobrado na conta do WhatsApp (é o valor da fatura). A Meta atualiza com algumas horas de atraso.</p>
            {erro && <div className="rounded-xl bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318]">{erro}</div>}
            {!d && carregando && <p className="m-0 text-[14px]">Consultando a Meta…</p>}
            {d && (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[14.5px]">
                            <thead>
                                <tr className="border-b border-[#EEF0F3] dark:border-white/10">
                                    <th className={rotuloTabela}>Categoria</th>
                                    <th className={`${rotuloTabela} text-right`}>Mensagens</th>
                                    <th className={`${rotuloTabela} text-right`}>Grátis</th>
                                    <th className={`${rotuloTabela} text-right`}>Cobradas</th>
                                    <th className={`${rotuloTabela} text-right`}>Custo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!d.categorias.length && <tr><td className="px-3 py-3 text-[#6B7488]" colSpan={5}>Nenhuma mensagem registrada pela Meta no período.</td></tr>}
                                {d.categorias.map((c) => (
                                    <tr key={c.categoria} className="border-b border-[#EEF0F3] dark:border-white/10">
                                        <td className="px-3 py-2 font-bold">{NOMES[c.categoria] || c.categoria}</td>
                                        <td className="px-3 py-2 text-right">{c.mensagens.toLocaleString("pt-BR")}</td>
                                        <td className="px-3 py-2 text-right">{c.gratis.toLocaleString("pt-BR")}</td>
                                        <td className="px-3 py-2 text-right font-bold">{c.cobradas.toLocaleString("pt-BR")}</td>
                                        <td className="px-3 py-2 text-right font-extrabold">{valor(c.custo)}</td>
                                    </tr>
                                ))}
                                <tr><td className="px-3 py-2 font-extrabold" colSpan={4}>Total cobrado</td><td className="px-3 py-2 text-right text-[18px] font-extrabold">{valor(d.total)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    {d.por_dia.length > 1 && (
                        <div className="mt-3 flex h-24 items-end gap-1" aria-label="Custo por dia">
                            {d.por_dia.map((x) => (
                                <div key={x.dia} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}: ${valor(x.custo)}`}>
                                    <div className="w-full rounded-t bg-[#3D6A99]" style={{ height: `${Math.max(2, (x.custo / maiorDia) * 80)}px` }} />
                                    {d.por_dia.length <= 16 && <span className="mt-1 text-[10.5px] text-[#6B7488]">{x.dia.slice(8, 10)}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                        {estimativa !== undefined && moeda === "BRL" && (
                            <span className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 dark:bg-white/10">Estimativa do app: <b>{valor(estimativa)}</b> · diferença {valor(d.total - estimativa)}</span>
                        )}
                        {moeda !== "BRL" && <span className="rounded-lg bg-[#FBF0C9] px-2.5 py-1 dark:bg-[#F2CB3F]/15">Valores na moeda da conta na Meta ({moeda})</span>}
                        <span className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 dark:bg-white/10">Consultado em {new Date(d.consultado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                </>
            )}
        </section>
    );
}
