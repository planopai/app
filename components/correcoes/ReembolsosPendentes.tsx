"use client";

import React, { useCallback, useEffect, useState } from "react";
import { brl, correcoesJson, dataHoraBR } from "./api";
import { usePodeCorrigir } from "./CorrecoesAtendimento";

/* Reembolsos pendentes (09/10/2026): OS canceladas que tinham recebimento. O cancelamento já estornou
   o lançamento; aqui o Financeiro registra que devolveu o dinheiro ao cliente (site, operadora, PIX…). */
export default function ReembolsosPendentes({ onAlterou }: { onAlterou?: (msg: string) => void }) {
    const pode = usePodeCorrigir();
    const [lista, setLista] = useState<any[]>([]);
    const [erro, setErro] = useState("");
    const [aberto, setAberto] = useState<number | null>(null);
    const [obs, setObs] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await correcoesJson({ reembolsos: 1 });
            setLista(r.dados || []);
            setErro("");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os reembolsos.");
        }
    }, []);

    useEffect(() => {
        if (pode.reembolso) void carregar();
    }, [pode.reembolso, carregar]);

    if (!pode.reembolso || (!lista.length && !erro)) return null;

    const registrar = async (osId: number) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        try {
            const r = await correcoesJson(null, { acao: "marcar_reembolsado", os_id: osId, obs: obs.trim() });
            setAberto(null);
            setObs("");
            onAlterou?.(r.msg);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível registrar.");
        } finally {
            setSalvando(false);
        }
    };

    const total = lista.reduce((a, r) => a + (Number(r.reembolso_valor) || 0), 0);

    return (
        <section className="rounded-2xl border-[1.5px] border-[#F2CB3F] bg-[#FCF3CC] p-3.5 text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-white">
            <div className="flex flex-wrap items-baseline gap-2">
                <div className="flex-1 text-sm font-extrabold">Reembolsos pendentes · {lista.length}</div>
                <div className="text-sm font-extrabold">{brl(total)}</div>
            </div>
            <div className="mt-0.5 text-xs">Atendimentos e pedidos cancelados que tinham pagamento. O lançamento já foi estornado; falta devolver ao cliente.</div>
            {erro ? <div className="mt-2 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92]">{erro}</div> : null}
            <ul className="mt-2.5 flex flex-col gap-2">
                {lista.map((r) => (
                    <li key={r.os_id} className="rounded-xl border border-[#E3E8F0] bg-white p-3 text-[13px] dark:border-white/[0.12] dark:bg-[#232B3F]">
                        <div className="flex items-baseline gap-2">
                            <b className="min-w-0 flex-1">
                                {r.numero_os} · {r.falecido || "—"}
                            </b>
                            <b className="shrink-0">{brl(r.reembolso_valor)}</b>
                        </div>
                        <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                            Cancelado {dataHoraBR(r.cancelado_em)}
                            {r.motivo ? ` · ${r.motivo}` : ""}
                        </div>
                        {aberto === r.os_id ? (
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input
                                    autoFocus
                                    value={obs}
                                    onChange={(e) => setObs(e.target.value)}
                                    maxLength={240}
                                    placeholder="Como foi devolvido (ex.: estorno no cartão pelo site)"
                                    className="h-11 min-w-0 flex-1 rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]"
                                />
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setAberto(null)} className="h-11 flex-1 rounded-xl border-[1.5px] border-[#313C55] px-3 text-sm font-bold dark:border-white/40 sm:flex-none">
                                        Voltar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={salvando || obs.trim().length < 3}
                                        onClick={() => void registrar(r.os_id)}
                                        className="h-11 flex-[1.4] rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-50 dark:bg-[#3D6A99] sm:flex-none"
                                    >
                                        {salvando ? "Salvando…" : "Confirmar"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setAberto(r.os_id);
                                    setObs("");
                                }}
                                className="mt-2 h-11 rounded-xl border-[1.5px] border-[#313C55] px-3 text-sm font-bold dark:border-white/40"
                            >
                                Registrar reembolso feito
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
