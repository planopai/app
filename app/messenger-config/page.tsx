"use client";

/**
 * Messenger · Configurações (14/10/2026) — rota /messenger-config · página "messenger-config" do pai_api.php
 * Cadastros que antes seriam regras no código. Nesta primeira versão:
 *  - Respostas rápidas: da empresa (todos usam ao digitar "/") e as pessoais de cada um
 *  - Geral: como o nome do atendente aparece para o cliente no WhatsApp e o limite de conversas fixadas
 * Próximas abas (pacotes 4 a 6): setores, horários, mensagens automáticas, avaliação, IA e Unymos.
 * Servidor: messenger.php (respostas, resposta_salvar, resposta_apagar, config, config_salvar).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import { Icone } from "../messenger/components/Lista";
import { limparCacheRespostas } from "../messenger/components/Acoes";
import { AbaEtiquetas, AbaSetores } from "./SetoresEtiquetas";

type Resposta = { id: number; atalho: string; texto: string; pessoal: boolean };
type Config = { assinatura: "completo" | "primeiro" | "nao"; max_fixadas: number; pode_editar: boolean };

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const campo = "mt-1 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3.5 text-[16px] text-[#1F2638] outline-none focus:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white";

export default function MessengerConfigPage() {
    const [aba, setAba] = useState<"respostas" | "setores" | "etiquetas" | "geral">("respostas");
    const [config, setConfig] = useState<Config | null>(null);
    const [respostas, setRespostas] = useState<Resposta[]>([]);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [editando, setEditando] = useState<Partial<Resposta> | null>(null);

    const carregar = useCallback(async () => {
        try {
            const [c, r] = await Promise.all([msgGet<Config>("config"), msgGet<Resposta[]>("respostas")]);
            setConfig(c);
            setRespostas(r);
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        }
    }, []);
    useEffect(() => {
        carregar();
    }, [carregar]);

    const salvarResposta = async () => {
        if (!editando) return;
        try {
            const r = await msgPost("resposta_salvar", { id: editando.id || 0, atalho: editando.atalho || "", texto: editando.texto || "", pessoal: !!editando.pessoal });
            setAviso(r.msg);
            setEditando(null);
            limparCacheRespostas();
            carregar();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const apagarResposta = async (r: Resposta) => {
        if (!window.confirm(`Apagar a resposta /${r.atalho}?`)) return;
        try {
            const x = await msgPost("resposta_apagar", { id: r.id });
            setAviso(x.msg);
            limparCacheRespostas();
            carregar();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const salvarGeral = async (mudanca: Partial<Config>) => {
        if (!config) return;
        const novo = { ...config, ...mudanca };
        setConfig(novo);
        try {
            const r = await msgPost("config_salvar", { assinatura: novo.assinatura, max_fixadas: novo.max_fixadas });
            setAviso(r.msg);
        } catch (e: any) {
            setErro(e.message);
            carregar();
        }
    };

    const podeEmpresa = !!config?.pode_editar;
    const avisar = useCallback((msg: string, comErro = false) => {
        if (comErro) {
            setErro(msg);
            setAviso("");
        } else {
            setAviso(msg);
            setErro("");
        }
    }, []);
    const daEmpresa = respostas.filter((r) => !r.pessoal);
    const minhas = respostas.filter((r) => r.pessoal);

    const ListaRespostas = ({ titulo, itens, editavel, pessoal }: { titulo: string; itens: Resposta[]; editavel: boolean; pessoal: boolean }) => (
        <section className={cartao}>
            <div className="mb-3 flex items-center gap-3">
                <h2 className="m-0 flex-1 text-lg font-extrabold">{titulo}</h2>
                {editavel && <button type="button" className={btnPri} onClick={() => setEditando({ atalho: "", texto: "", pessoal })}>+ Nova</button>}
            </div>
            {!itens.length && <p className="text-[15px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma resposta cadastrada.</p>}
            <div className="flex flex-col divide-y divide-[#EEF0F3] dark:divide-white/10">
                {itens.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 py-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">/{r.atalho}</div>
                            <div className="whitespace-pre-wrap break-words text-[15px] text-[#1F2638] dark:text-white">{r.texto}</div>
                        </div>
                        {editavel && (
                            <div className="flex flex-none gap-1">
                                <button type="button" onClick={() => setEditando(r)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#F0F2F5] dark:hover:bg-white/10" aria-label={`Editar /${r.atalho}`}><Icone nome="editar" className="h-5 w-5" /></button>
                                <button type="button" onClick={() => apagarResposta(r)} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-white/10" aria-label={`Apagar /${r.atalho}`}><Icone nome="trash" className="h-5 w-5" /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1220px] flex-col gap-4">
                <div className="flex items-center gap-4">
                    <div className="hidden h-14 w-14 flex-none items-center justify-center rounded-[18px] bg-[#313C55] text-white md:flex dark:bg-[#3D6A99]"><Icone nome="msg" className="h-[26px] w-[26px]" /></div>
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[32px]">Configurações do Messenger</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Cadastros usados nas conversas. As mudanças valem na hora, sem mexer no sistema.</p>
                    </div>
                    <a href="/messenger" className="hidden h-11 items-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold md:flex dark:border-white/25 dark:bg-[#232B3F]">Voltar ao Messenger</a>
                </div>

                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções">
                    {([["respostas", "Respostas rápidas"], ["setores", "Setores"], ["etiquetas", "Etiquetas"], ["geral", "Geral"]] as const).map(([id, nome]) => (
                        <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`h-[40px] rounded-full px-4 text-[15.5px] ${aba === id ? "bg-[#E3EFC0] font-extrabold text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-white" : "bg-white font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]"}`}>{nome}</button>
                    ))}
                </div>

                {(erro || aviso) && (
                    <div className={`flex items-center gap-3 rounded-xl border px-4 py-2 text-sm font-bold ${erro ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]" : "border-[#B3CE52] bg-[#EEF5D6] dark:bg-[#B3CE52]/15"}`} role="status">
                        <span className="flex-1">{erro || aviso}</span>
                        <button type="button" onClick={() => { setErro(""); setAviso(""); }} aria-label="Fechar aviso"><Icone nome="x" className="h-4 w-4" /></button>
                    </div>
                )}

                {aba === "respostas" && (
                    <>
                        <p className="text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Na conversa, digite <b>/</b> e escolha a resposta. As da empresa aparecem para todos; as pessoais, só para quem criou.</p>
                        <ListaRespostas titulo="Da empresa" itens={daEmpresa} editavel={podeEmpresa} pessoal={false} />
                        <ListaRespostas titulo="Minhas respostas" itens={minhas} editavel pessoal />
                    </>
                )}

                {aba === "setores" && <AbaSetores podeEditar={podeEmpresa} avisar={avisar} />}
                {aba === "etiquetas" && <AbaEtiquetas podeEditar={podeEmpresa} avisar={avisar} />}

                {aba === "geral" && config && (
                    <section className={cartao}>
                        <h2 className="m-0 mb-3 text-lg font-extrabold">Geral</h2>
                        <label className="block">
                            <span className={rotulo}>Nome do atendente nas mensagens para o cliente (WhatsApp)</span>
                            <select className={`${campo} h-12`} value={config.assinatura} disabled={!podeEmpresa} onChange={(e) => salvarGeral({ assinatura: e.target.value as Config["assinatura"] })}>
                                <option value="completo">Nome completo (ex.: *Dimar Júnior:*)</option>
                                <option value="primeiro">Só o primeiro nome (ex.: *Dimar:*)</option>
                                <option value="nao">Não mostrar o nome</option>
                            </select>
                        </label>
                        <label className="mt-4 block">
                            <span className={rotulo}>Quantas conversas cada pessoa pode fixar no topo</span>
                            <input type="number" min={1} max={10} className={`${campo} h-12 max-w-[160px]`} value={config.max_fixadas} disabled={!podeEmpresa} onChange={(e) => setConfig({ ...config, max_fixadas: Number(e.target.value) || 1 })} onBlur={() => salvarGeral({})} />
                        </label>
                        {!podeEmpresa && <p className="mt-3 text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">Só quem tem a página "Messenger · Configurações" altera estes itens.</p>}
                    </section>
                )}
            </div>

            {editando && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" style={{ background: "rgba(49,60,85,0.45)" }} onClick={() => setEditando(null)}>
                    <div role="dialog" aria-label={editando.id ? "Editar resposta rápida" : "Nova resposta rápida"} className="flex w-full max-w-[560px] flex-col gap-3 rounded-t-3xl bg-white p-6 text-[#313C55] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white" onClick={(e) => e.stopPropagation()}>
                        <h2 className="m-0 text-xl font-extrabold">{editando.id ? "Editar resposta" : "Nova resposta"}{editando.pessoal ? " pessoal" : " da empresa"}</h2>
                        <label className="block"><span className={rotulo}>Atalho (depois da /)</span><input className={`${campo} h-12`} value={editando.atalho || ""} onChange={(e) => setEditando({ ...editando, atalho: e.target.value.replace(/[^a-z0-9_-]/gi, "").toLowerCase() })} placeholder="documentos" maxLength={40} /></label>
                        <label className="block"><span className={rotulo}>Texto</span><textarea className={`${campo} py-3`} rows={6} value={editando.texto || ""} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} placeholder="Para o atendimento, traga: RG e CPF do falecido…" /></label>
                        <div className="flex justify-end gap-3">
                            <button type="button" className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
                            <button type="button" className={btnPri} disabled={!editando.atalho || !editando.texto?.trim()} onClick={salvarResposta}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
