"use client";

/* Escolha de produto do estoque para o orçamento (urna, roupa, véu, cordão, invol e modelo de coroa), com o preço de tabela. */

import React, { useEffect, useState } from "react";
import { buscarCoroas, buscarNoEstoque, precosDe, type ProdutoEstoque } from "./api";
import { brl, type ItemEscolhido } from "./tipos";
import { CAMPO, Ic, Icone, Janela, MUTED, ROTULO } from "./ui";

type Fonte = { action: string; locais: string[] } | { coroa: "natural" | "artificial" };

export default function EscolhaProduto({ rotulo, fonte, valor, preco, onMudar, obrigatorio }: {
    rotulo: string;
    fonte: Fonte;
    valor: ItemEscolhido;
    /** Preço já conhecido do item escolhido (vem da folha calculada). */
    preco?: number | null;
    onMudar: (v: ItemEscolhido) => void;
    obrigatorio?: boolean;
}) {
    const [aberto, setAberto] = useState(false);
    return (
        <div className="min-w-0">
            <span className={ROTULO}>
                {rotulo}
                {obrigatorio ? " *" : ""}
            </span>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setAberto(true)}
                    className={`${CAMPO.replace("h-12 ", "")} flex min-h-12 items-center justify-between gap-2 py-2.5 text-left`}
                >
                    {/* Nome inteiro (quebra a linha, um pouco menor), para ler sem cortar (14/10/2026) */}
                    <span className={`min-w-0 flex-1 break-words ${valor ? "text-[14px] leading-snug" : "font-normal text-[#8A93A6]"}`}>{valor ? valor.nome : "Escolher no estoque…"}</span>
                    {valor && preco !== undefined ? <span className={`shrink-0 text-[13px] font-bold ${MUTED}`}>{brl(preco)}</span> : <Icone d={Ic.busca} tam={18} />}
                </button>
                {valor ? (
                    <button type="button" aria-label={`Tirar ${rotulo}`} onClick={() => onMudar(null)} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F1F4F8] text-[#5B6478] hover:bg-[#E3E8F0] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <Icone d={Ic.x} />
                    </button>
                ) : null}
            </div>
            {aberto ? (
                <JanelaBusca
                    titulo={rotulo}
                    fonte={fonte}
                    onFechar={() => setAberto(false)}
                    onEscolher={(p) => {
                        onMudar({ produto_id: p.produto_id, nome: p.nome, local: p.local });
                        setAberto(false);
                    }}
                />
            ) : null}
        </div>
    );
}

function JanelaBusca({ titulo, fonte, onFechar, onEscolher }: { titulo: string; fonte: Fonte; onFechar: () => void; onEscolher: (p: ProdutoEstoque) => void }) {
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<ProdutoEstoque[]>([]);
    const [precos, setPrecos] = useState<Record<string, number | null>>({});
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const chave = JSON.stringify(fonte);

    useEffect(() => {
        const ac = new AbortController();
        const t = window.setTimeout(async () => {
            setCarregando(true);
            setErro("");
            try {
                const f = JSON.parse(chave) as Fonte;
                const lista = "coroa" in f ? await buscarCoroas(f.coroa, q, ac.signal) : await buscarNoEstoque(f.action, f.locais, q, ac.signal);
                setRows(lista);
                const faltam = lista.map((r) => r.produto_id);
                if (faltam.length) precosDe(faltam).then((p) => setPrecos((a) => ({ ...a, ...p }))).catch(() => {});
            } catch (e: any) {
                if (e?.name !== "AbortError") {
                    setRows([]);
                    setErro(e?.message || "Não foi possível buscar no estoque.");
                }
            } finally {
                setCarregando(false);
            }
        }, 200);
        return () => {
            window.clearTimeout(t);
            ac.abort();
        };
    }, [q, chave]);

    return (
        <Janela titulo={titulo} subtitulo="Só aparecem os produtos com saldo no estoque." onFechar={onFechar} largura="max-w-xl">
            <label className="mb-3 flex h-12 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3.5 dark:bg-[#1C2334]">
                <Icone d={Ic.busca} tam={18} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome ou código" className="h-full w-full min-w-0 bg-transparent text-[16px] font-semibold outline-none" />
            </label>
            {erro ? <p className="py-3 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
            {carregando && !rows.length ? <p className={`py-6 text-center text-sm ${MUTED}`}>Carregando…</p> : null}
            {!carregando && !rows.length && !erro ? <p className={`py-6 text-center text-sm ${MUTED}`}>Nada encontrado.</p> : null}
            <ul className="flex flex-col">
                {rows.map((r) => {
                    const p = precos[String(r.produto_id)];
                    return (
                        <li key={r.produto_id}>
                            <button type="button" onClick={() => onEscolher(r)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-bold leading-snug">{r.nome}</span>
                                    <span className={`block text-xs ${MUTED}`}>
                                        {r.codigo_barras ? `CB ${r.codigo_barras}` : ""}
                                        {r.local ? `${r.codigo_barras ? " · " : ""}${r.local}` : ""}
                                    </span>
                                </span>
                                <span className="shrink-0 text-[15px] font-extrabold tabular-nums">{p === undefined ? "…" : brl(p)}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </Janela>
    );
}
