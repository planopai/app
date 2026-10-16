"use client";

/**
 * Pacote 3 (14/10/2026): peças da conversa no estilo WhatsApp.
 *  - MenuMensagem: reagir com emoji, responder, encaminhar, copiar e apagar (toque longo no celular, setinha no computador)
 *  - Reacoes: emojis embaixo do balão
 *  - BarraBusca: buscar dentro da conversa
 *  - SugestoesRespostas: respostas rápidas ao digitar "/"
 *  - MenuAnexar: foto/documento, localização, contato e nota interna
 */
import React, { useEffect, useRef, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import type { Mensagem } from "@/components/messenger/tipos";
import { Icone } from "./Lista";

export const EMOJIS_RAPIDOS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Fecha o que estiver aberto ao tocar fora dele. */
function useFecharFora(aberto: boolean, fechar: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: Event) => {
            if (ref.current && !ref.current.contains(e.target as Node)) fechar();
        };
        const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
        document.addEventListener("pointerdown", fora);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("pointerdown", fora);
            document.removeEventListener("keydown", esc);
        };
    }, [aberto, fechar]);
    return ref;
}

const itemMenu = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-bold text-[#1F2638] hover:bg-[#F0F2F5] dark:text-white dark:hover:bg-white/10";

export function MenuMensagem(props: {
    m: Mensagem;
    minha: boolean;
    eu: number;
    onFechar: () => void;
    onReagir?: (emoji: string) => void;
    onResponder?: () => void;
    onEncaminhar?: () => void;
    onFixar?: () => void;
    fixada?: boolean;
    onApagar?: () => void;
    onDados?: () => void;
}) {
    const ref = useFecharFora(true, props.onFechar);
    const minhaReacao = props.m.reacoes?.find((r) => r.usuario_id === props.eu)?.emoji || "";
    const fazer = (f?: () => void) => () => {
        props.onFechar();
        f?.();
    };
    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(props.m.texto || "");
        } catch {
            /* sem área de transferência */
        }
    };
    return (
        <div ref={ref} role="menu" className={`absolute top-full z-30 mt-1 w-60 overflow-hidden rounded-2xl border border-[#E1E5EC] bg-white py-1 shadow-xl dark:border-white/12 dark:bg-[#1C2334] ${props.minha ? "right-0" : "left-0"}`}>
            {props.onReagir && (
                <div className="flex items-center justify-between gap-1 border-b border-[#EEF0F3] px-2 pb-1.5 pt-1 dark:border-white/10">
                    {EMOJIS_RAPIDOS.map((e) => (
                        <button key={e} type="button" onClick={fazer(() => props.onReagir!(minhaReacao === e ? "" : e))} className={`flex h-10 w-10 items-center justify-center rounded-full text-[22px] hover:bg-[#F0F2F5] dark:hover:bg-white/10 ${minhaReacao === e ? "bg-[#E3EFC0] dark:bg-[#B3CE52]/25" : ""}`} aria-label={`Reagir com ${e}`}>{e}</button>
                    ))}
                </div>
            )}
            {props.onResponder && <button type="button" role="menuitem" onClick={fazer(props.onResponder)} className={itemMenu}><Icone nome="responder" className="h-5 w-5" />Responder</button>}
            {props.onEncaminhar && <button type="button" role="menuitem" onClick={fazer(props.onEncaminhar)} className={itemMenu}><Icone nome="encaminhar" className="h-5 w-5" />Encaminhar</button>}
            {props.onFixar && <button type="button" role="menuitem" onClick={fazer(props.onFixar)} className={itemMenu}><Icone nome="pin" className="h-5 w-5" />{props.fixada ? "Desafixar" : "Fixar na conversa"}</button>}
            {props.m.texto && <button type="button" role="menuitem" onClick={fazer(copiar)} className={itemMenu}><Icone nome="copiar" className="h-5 w-5" />Copiar texto</button>}
            {props.onDados && <button type="button" role="menuitem" onClick={fazer(props.onDados)} className={itemMenu}><Icone nome="info" className="h-5 w-5" />Dados da mensagem</button>}
            {props.onApagar && <button type="button" role="menuitem" onClick={fazer(props.onApagar)} className={`${itemMenu} !text-[#B42318] dark:!text-[#FF9C92]`}><Icone nome="trash" className="h-5 w-5" />Apagar</button>}
        </div>
    );
}

/** Emojis da mensagem, agrupados (como no WhatsApp). Tocar no próprio emoji tira a reação. */
export function Reacoes({ m, eu, minha, onReagir, onVer }: { m: Mensagem; eu: number; minha: boolean; onReagir?: (emoji: string) => void; onVer?: () => void }) {
    const lista = m.reacoes || [];
    if (!lista.length) return null;
    const grupos = new Map<string, { qtd: number; nomes: string[]; minha: boolean }>();
    lista.forEach((r) => {
        const g = grupos.get(r.emoji) || { qtd: 0, nomes: [], minha: false };
        g.qtd++;
        g.nomes.push(r.usuario_id === eu ? "Você" : r.nome || "—");
        g.minha = g.minha || r.usuario_id === eu;
        grupos.set(r.emoji, g);
    });
    return (
        <div className={`-mt-1.5 mb-1 flex flex-wrap gap-1 ${minha ? "justify-end pr-2" : "pl-2"}`}>
            {[...grupos.entries()].map(([emoji, g]) => (
                <button
                    key={emoji}
                    type="button"
                    title={g.nomes.join(", ")}
                    onClick={() => (onVer ? onVer() : g.minha && onReagir?.(""))}
                    className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[14px] shadow-sm ${g.minha ? "border-[#B3CE52] bg-[#E3EFC0] dark:bg-[#B3CE52]/25" : "border-[#E1E5EC] bg-white dark:border-white/12 dark:bg-[#232B3F]"}`}
                    aria-label={`${emoji} de ${g.nomes.join(", ")}${onVer ? ". Tocar para ver quem reagiu" : g.minha ? ". Tocar para tirar a sua reação" : ""}`}
                >
                    <span>{emoji}</span>
                    {g.qtd > 1 && <span className="text-[12px] font-extrabold text-[#4A5468] dark:text-[#C9D1DE]">{g.qtd}</span>}
                </button>
            ))}
        </div>
    );
}

/** Busca dentro das mensagens carregadas da conversa. */
export function BarraBusca(props: { termo: string; setTermo: (t: string) => void; total: number; atual: number; onAnterior: () => void; onProxima: () => void; onFechar: () => void; temMais: boolean }) {
    const campo = useRef<HTMLInputElement>(null);
    useEffect(() => campo.current?.focus(), []);
    return (
        <div className="flex items-center gap-1.5 border-b border-[#E6E9EE] bg-white px-2 py-1.5 dark:border-white/12 dark:bg-[#232B3F]">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F0F2F5] px-3.5 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <Icone nome="search" className="h-5 w-5" />
                <input ref={campo} type="search" value={props.termo} onChange={(e) => props.setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) { props.onAnterior(); } else { props.onProxima(); } } if (e.key === "Escape") props.onFechar(); }} placeholder="Buscar nesta conversa" aria-label="Buscar nesta conversa" className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1F2638] outline-none dark:text-white" />
                {props.termo && <span className="flex-none text-[13px] font-bold">{props.total ? `${props.atual + 1} de ${props.total}` : "0"}</span>}
            </label>
            <button type="button" onClick={props.onAnterior} disabled={!props.total} className="flex h-10 w-10 items-center justify-center rounded-full text-[#313C55] hover:bg-black/5 disabled:opacity-30 dark:text-white" aria-label="Resultado anterior"><span className="rotate-180"><Icone nome="chevron" className="h-5 w-5" /></span></button>
            <button type="button" onClick={props.onProxima} disabled={!props.total} className="flex h-10 w-10 items-center justify-center rounded-full text-[#313C55] hover:bg-black/5 disabled:opacity-30 dark:text-white" aria-label="Próximo resultado"><Icone nome="chevron" className="h-5 w-5" /></button>
            <button type="button" onClick={props.onFechar} className="flex h-10 w-10 items-center justify-center rounded-full text-[#313C55] hover:bg-black/5 dark:text-white" aria-label="Fechar busca"><Icone nome="x" className="h-5 w-5" /></button>
            {props.temMais && props.termo && <span className="sr-only">A busca considera as mensagens já carregadas.</span>}
        </div>
    );
}

/* -------- respostas rápidas -------- */
type Resposta = { id: number; atalho: string; texto: string; pessoal: boolean };
let cacheRespostas: Resposta[] | null = null;
let buscandoRespostas: Promise<Resposta[]> | null = null;
export function limparCacheRespostas() {
    cacheRespostas = null;
    buscandoRespostas = null;
}
export function useRespostas() {
    const [lista, setLista] = useState<Resposta[]>(cacheRespostas || []);
    useEffect(() => {
        if (cacheRespostas) return;
        buscandoRespostas = buscandoRespostas || msgGet<Resposta[]>("respostas", {}, false).catch(() => []);
        buscandoRespostas.then((l) => {
            cacheRespostas = l;
            setLista(l);
        });
    }, []);
    return lista;
}

/** Ao digitar "/" no começo do campo: lista as respostas rápidas que combinam. */
export function SugestoesRespostas({ texto, onEscolher }: { texto: string; onEscolher: (t: string) => void }) {
    const respostas = useRespostas();
    if (!texto.startsWith("/") || texto.includes(" ") || texto.includes("\n")) return null;
    const busca = texto.slice(1).toLowerCase();
    const achadas = respostas.filter((r) => r.atalho.toLowerCase().includes(busca) || r.texto.toLowerCase().includes(busca)).slice(0, 8);
    return (
        <div className="mx-2 mb-1 max-h-72 overflow-y-auto rounded-2xl border border-[#E1E5EC] bg-white py-1 shadow-xl md:mx-4 dark:border-white/12 dark:bg-[#232B3F]" role="listbox" aria-label="Respostas rápidas">
            {achadas.map((r) => (
                <button key={r.id} type="button" role="option" aria-selected="false" onClick={() => onEscolher(r.texto)} className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/10">
                    <span className="text-[14px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">/{r.atalho}{r.pessoal ? " · minha" : ""}</span>
                    <span className="line-clamp-2 text-[15px] text-[#1F2638] dark:text-white">{r.texto}</span>
                </button>
            ))}
            {!achadas.length && <p className="px-4 py-2 text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">{respostas.length ? "Nenhuma resposta com esse atalho." : "Nenhuma resposta rápida cadastrada. Cadastre em Messenger · Configurações."}</p>}
        </div>
    );
}

/** Menu do clipe: foto/documento, localização, contato e nota interna. */
export function MenuAnexar(props: { onFechar: () => void; midias: boolean; onArquivo: () => void; onLocalizacao: () => void; onContato: () => void; onNota: () => void; podeEnviar: boolean }) {
    const ref = useFecharFora(true, props.onFechar);
    const fazer = (f: () => void) => () => {
        props.onFechar();
        f();
    };
    const opcao = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15.5px] font-bold text-[#1F2638] hover:bg-[#F0F2F5] disabled:opacity-40 dark:text-white dark:hover:bg-white/10";
    const bolinha = (cor: string) => `flex h-10 w-10 flex-none items-center justify-center rounded-full text-white ${cor}`;
    return (
        <div ref={ref} role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-[#E1E5EC] bg-white p-1.5 shadow-xl dark:border-white/12 dark:bg-[#1C2334]">
            {props.podeEnviar && (
                <>
                    <button type="button" role="menuitem" disabled={!props.midias} onClick={fazer(props.onArquivo)} className={opcao}><span className={bolinha("bg-[#3D6A99]")}><Icone nome="file" className="h-5 w-5" /></span>Foto ou documento</button>
                    <button type="button" role="menuitem" onClick={fazer(props.onLocalizacao)} className={opcao}><span className={bolinha("bg-[#4C9A2A]")}><Icone nome="local" className="h-5 w-5" /></span>Localização</button>
                    <button type="button" role="menuitem" onClick={fazer(props.onContato)} className={opcao}><span className={bolinha("bg-[#313C55]")}><Icone nome="contato" className="h-5 w-5" /></span>Contato</button>
                </>
            )}
            <button type="button" role="menuitem" onClick={fazer(props.onNota)} className={opcao}><span className={bolinha("bg-[#C9A21E]")}><Icone nome="nota" className="h-5 w-5" /></span>Nota interna</button>
        </div>
    );
}
