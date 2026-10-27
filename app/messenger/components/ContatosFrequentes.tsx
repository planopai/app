"use client";

/**
 * Contatos frequentes da "Nova conversa" pelo WhatsApp (27/10/2026): favoritos (estrela, valem para a equipe toda) no
 * topo e, abaixo, os mais conversados dos últimos 90 dias, com busca por nome, empresa ou número. Tocar num contato
 * preenche celular, nome, tipo e empresa. Clientes só aparecem nos mais conversados e na busca para a Gestão.
 * Servidor: aurora_09.php (contatos, favorito).
 */
import React, { useEffect, useState } from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { apiJson, API_BASE } from "@/components/messenger/api";

export type ContatoFrequente = { id: number; nome: string; telefone: string; tipo: string; empresa: string | null; favorito: boolean; conversas: number; ultima: string | null };
type Lista = { favoritos: ContatoFrequente[]; frequentes: ContatoFrequente[]; busca: ContatoFrequente[]; tem_favorito: boolean };

const TIPO_NOME: Record<string, string> = { cliente: "Cliente", fornecedor: "Fornecedor", prestador: "Prestador", parceiro: "Parceiro", publico: "Público" };

/** 5577999998888 → (77) 99999-8888 */
export function telefoneBonito(t: string) {
    const d = t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return t;
}

export default function ContatosFrequentes({ onEscolher }: { onEscolher: (c: ContatoFrequente) => void }) {
    const [q, setQ] = useState("");
    const [dados, setDados] = useState<Lista | null>(null);
    const [erro, setErro] = useState("");
    const [aberto, setAberto] = useState(true);

    async function carregar(busca: string) {
        try {
            const u = new URL(`${API_BASE}/aurora_09.php`);
            u.searchParams.set("action", "contatos");
            if (busca.trim().length >= 2) u.searchParams.set("q", busca.trim());
            u.searchParams.set("_", String(Date.now()));
            const r = await apiJson(u.toString());
            setDados(r.dados as Lista);
            setErro("");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os contatos.");
        }
    }

    useEffect(() => {
        const t = setTimeout(() => {
            carregar(q);
        }, q ? 350 : 0);
        return () => clearTimeout(t);
    }, [q]);

    async function estrela(c: ContatoFrequente) {
        try {
            await apiJson(`${API_BASE}/aurora_09.php?action=favorito`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contato_id: c.id, favorito: !c.favorito }),
            });
            await carregar(q);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível marcar.");
        }
    }

    const linha = (c: ContatoFrequente) => (
        <li key={c.id} className="flex items-center gap-1 border-b border-[#E3E8F0] last:border-0 dark:border-white/10">
            <button type="button" onClick={() => onEscolher(c)} className="flex min-h-[48px] min-w-0 flex-1 flex-col items-start justify-center px-2 py-1.5 text-left hover:bg-[#F6F8FB] dark:hover:bg-white/5">
                <span className="w-full truncate text-[15px] font-extrabold">{c.nome || telefoneBonito(c.telefone)}</span>
                <span className="w-full truncate text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                    {[TIPO_NOME[c.tipo] || "Cliente", c.empresa, c.nome ? telefoneBonito(c.telefone) : null].filter(Boolean).join(" · ")}
                </span>
            </button>
            {dados?.tem_favorito && (
                <button type="button" onClick={() => estrela(c)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center" aria-label={c.favorito ? "Tirar dos frequentes" : "Marcar como frequente"} title={c.favorito ? "Tirar dos frequentes" : "Marcar como frequente"}>
                    {c.favorito ? <IconStarFilled size={20} className="text-[#E4BC30]" /> : <IconStar size={20} className="text-[#8A93A6]" />}
                </button>
            )}
        </li>
    );

    const titulo = (t: string) => <div className="px-2 pb-1 pt-2 text-[11.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{t}</div>;
    const buscando = q.trim().length >= 2;
    const vazio = dados && !buscando && !dados.favoritos.length && !dados.frequentes.length;

    return (
        <div className="rounded-xl border border-[#E1E5EC] dark:border-white/15">
            <div className="flex items-center gap-2 px-3 pt-2">
                <span className="flex-1 text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Contatos frequentes</span>
                <button type="button" onClick={() => setAberto((v) => !v)} className="text-[13px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{aberto ? "esconder" : "mostrar"}</button>
            </div>
            {aberto && (
                <div className="px-1 pb-2">
                    <div className="px-2 pt-2">
                        <input className="h-11 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa ou número" aria-label="Buscar contato" />
                    </div>
                    {erro && <p className="mx-2 mb-0 mt-2 text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p>}
                    {!dados && !erro && <p className="mx-2 mb-0 mt-2 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">Carregando…</p>}
                    {dados && (
                        <div className="max-h-[240px] overflow-auto">
                            {buscando ? (
                                <>
                                    {titulo("Resultado da busca")}
                                    {dados.busca.length ? <ul className="m-0 list-none p-0">{dados.busca.map(linha)}</ul> : <p className="mx-2 my-1 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhum contato encontrado. Digite o celular abaixo para falar com um número novo.</p>}
                                </>
                            ) : (
                                <>
                                    {dados.favoritos.length > 0 && (<>{titulo("Favoritos")}<ul className="m-0 list-none p-0">{dados.favoritos.map(linha)}</ul></>)}
                                    {dados.frequentes.length > 0 && (<>{titulo("Mais conversados (90 dias)")}<ul className="m-0 list-none p-0">{dados.frequentes.map(linha)}</ul></>)}
                                    {vazio && <p className="mx-2 my-1 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">Ainda não há contatos frequentes. Busque pelo nome ou digite o celular abaixo.</p>}
                                </>
                            )}
                            {!dados.tem_favorito && <p className="mx-2 mb-0 mt-1 text-[12.5px] text-[#8A5A00] dark:text-[#F7E39A]">A estrela de favorito aparece depois de rodar o SQL dos contatos frequentes.</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
