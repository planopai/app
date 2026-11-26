"use client";

/**
 * 26/11/2026: quadro "Mesmo contrato" no painel do cliente — outras pessoas do mesmo contrato com conversa no Messenger
 * (titular e dependentes, pelo WhatsApp ou pelo Aplicativo do Associado). Cada pessoa tem a própria conversa; daqui a equipe
 * abre a outra sem procurar na lista. Dados: messenger.php?acao=mesmo_contrato (aurora_28.php).
 */
import React, { useEffect, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import type { Conversa } from "@/components/messenger/tipos";

type Pessoa = { contato_id: number; nome: string; relacao: string; contrato: string; conversa_id: number | null; em_atendimento: boolean; ultima_em: string | null; app: boolean; canal: string };

const RELACAO: Record<string, string> = { titular: "Titular", dependente: "Dependente", filho: "Filho(a)", conjuge: "Cônjuge", familiar: "Familiar", responsavel: "Responsável", outro: "Outro" };

export default function MesmoContrato({ conversa }: { conversa: Conversa }) {
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    useEffect(() => {
        let vivo = true;
        setPessoas([]);
        if (conversa.tipo !== "externo") return;
        msgGet<Pessoa[]>("mesmo_contrato", { conversa_id: conversa.id })
            .then((l) => vivo && setPessoas(Array.isArray(l) ? l : []))
            .catch(() => vivo && setPessoas([]));
        return () => {
            vivo = false;
        };
    }, [conversa.id, conversa.tipo]);
    if (!pessoas.length) return null;
    return (
        <section className="mt-3 rounded-xl border border-[#E1E5EC] p-3 dark:border-white/15" aria-label="Mesmo contrato">
            <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Mesmo contrato · {pessoas.length}</div>
            <ul className="mt-2 flex flex-col gap-1.5">
                {pessoas.map((p) => (
                    <li key={p.contato_id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-extrabold">{p.nome}</span>
                            <span className="flex flex-wrap items-center gap-1 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                {RELACAO[p.relacao] || p.relacao} · Contrato {p.contrato}
                                {(p.app || p.canal === "app") && <span className="rounded bg-[#EDE7FB] px-1 font-extrabold text-[#5B3FB0] dark:bg-[#6D4FC2]/30 dark:text-[#D8CCFF]">📱 App</span>}
                                {p.em_atendimento && <span className="rounded bg-[#EEF5D6] px-1 font-extrabold text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]">em atendimento</span>}
                            </span>
                        </span>
                        {p.conversa_id && p.conversa_id !== conversa.id && (
                            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("pai:messenger-abrir", { detail: { conversa_id: p.conversa_id } }))}
                                className="h-9 flex-none rounded-lg border border-[#C9D1DE] px-3 text-[13px] font-extrabold text-[#313C55] hover:bg-[#F0F2F5] dark:border-white/25 dark:text-white dark:hover:bg-white/10">
                                Abrir
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
