"use client";

import React, { useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import type { Conversa, Perfil } from "@/components/messenger/tipos";
import { Icone } from "./Lista";

function Janela({ titulo, sub, onFechar, children, rodape }: { titulo: string; sub?: string; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" style={{ background: "rgba(49,60,85,0.45)" }} onClick={onFechar}>
            <div role="dialog" aria-label={titulo} className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3 border-b border-[#E3E8F0] px-6 py-5">
                    <div className="flex-1"><h2 className="m-0 text-xl font-extrabold">{titulo}</h2>{sub && <p className="mt-1 text-sm text-[#5B6478]">{sub}</p>}</div>
                    <button type="button" onClick={onFechar} className="flex h-11 w-11 items-center justify-center" aria-label="Fechar"><Icone nome="x" /></button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5">{children}</div>
                {rodape && <div className="flex justify-end gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-6 py-4">{rodape}</div>}
            </div>
        </div>
    );
}
const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55]";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-40";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478]";

type Colega = { id: number; nome: string; atendente_whatsapp: boolean };

/** Nova conversa individual ou novo grupo. */
export function NovaConversa({ grupoInicial, onFechar, onAberta }: { grupoInicial: boolean; onFechar: () => void; onAberta: (c: Conversa) => void }) {
    const [modo, setModo] = useState<"colega" | "grupo">(grupoInicial ? "grupo" : "colega");
    const [colegas, setColegas] = useState<Colega[]>([]);
    const [busca, setBusca] = useState("");
    const [nome, setNome] = useState("");
    const [marcados, setMarcados] = useState<number[]>([]);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        msgGet<Colega[]>("usuarios").then(setColegas).catch((e) => setErro(e.message));
    }, []);
    const filtrados = colegas.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));
    const abrir = async (id: number) => {
        setSalvando(true);
        try {
            onAberta((await msgPost("abrir_individual", { usuario_id: id })).dados);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    const criar = async () => {
        setSalvando(true);
        try {
            onAberta((await msgPost("criar_grupo", { titulo: nome, membros: marcados })).dados);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo={modo === "grupo" ? "Criar grupo" : "Nova conversa"}
            sub={modo === "grupo" ? "Qualquer usuário pode criar um grupo." : "Escolha um colega."}
            onFechar={onFechar}
            rodape={modo === "grupo" ? (<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={salvando || !nome.trim() || !marcados.length} onClick={criar}>Criar grupo</button></>) : undefined}
        >
            <div className="flex gap-1 rounded-[14px] bg-[#F1F4F8] p-1">
                {(["colega", "grupo"] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={`h-10 flex-1 rounded-[10px] text-sm font-extrabold ${modo === m ? "bg-white shadow-sm" : "text-[#6B7488]"}`}>{m === "colega" ? "Conversa" : "Grupo"}</button>
                ))}
            </div>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
            {modo === "grupo" && (
                <label className="block"><span className={rotulo}>Nome do grupo</span><input className="mt-1 h-12 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[15px] outline-none" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plantão de domingo" maxLength={120} /></label>
            )}
            <input type="search" className="h-11 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-sm outline-none" placeholder="Buscar colega" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar colega" />
            <div className="flex flex-col">
                {filtrados.map((c) =>
                    modo === "colega" ? (
                        <button key={c.id} type="button" disabled={salvando} onClick={() => abrir(c.id)} className="flex min-h-[48px] items-center gap-3 rounded-xl px-2 text-left text-[15px] font-bold hover:bg-[#EEF2F7]">{c.nome}</button>
                    ) : (
                        <label key={c.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-[15px] font-bold hover:bg-[#EEF2F7]">
                            <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={marcados.includes(c.id)} onChange={(e) => setMarcados(e.target.checked ? [...marcados, c.id] : marcados.filter((x) => x !== c.id))} />{c.nome}
                        </label>
                    )
                )}
                {!filtrados.length && <p className="text-sm text-[#6B7488]">Nenhum colega encontrado.</p>}
            </div>
        </Janela>
    );
}

/** Transferir atendimento de cliente para outro atendente. Quem transfere passa a só acompanhar. */
export function Transferir({ conversa, onFechar, onFeito }: { conversa: Conversa; onFechar: () => void; onFeito: () => void }) {
    const [lista, setLista] = useState<{ usuario_id: number; nome: string; em_atendimento: number }[]>([]);
    const [para, setPara] = useState(0);
    const [obs, setObs] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        msgGet<any[]>("atendentes").then((l) => setLista(l.filter((a) => a.usuario_id !== conversa.responsavel?.id))).catch((e) => setErro(e.message));
    }, [conversa.responsavel?.id]);
    const confirmar = async () => {
        setSalvando(true);
        try {
            await msgPost("transferir", { conversa_id: conversa.id, para_usuario_id: para, observacao: obs });
            onFeito();
        } catch (e: any) {
            setErro(e.message);
            setSalvando(false);
        }
    };
    return (
        <Janela titulo="Transferir conversa" sub={`${conversa.titulo} · o novo responsável recebe todo o atendimento em andamento.`} onFechar={onFechar}
            rodape={<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={!para || salvando} onClick={confirmar}>Transferir</button></>}>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
            <span className={rotulo}>Transferir para (atendentes do WhatsApp)</span>
            {lista.map((a) => (
                <label key={a.usuario_id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-[15px] font-bold">
                    <input type="radio" name="para" className="h-5 w-5 accent-[#313C55]" checked={para === a.usuario_id} onChange={() => setPara(a.usuario_id)} />
                    <span className="flex-1">{a.nome}</span>
                    <span className="rounded-full bg-[#E6F7FE] px-2 py-0.5 text-xs font-extrabold">{a.em_atendimento} em atendimento</span>
                </label>
            ))}
            {!lista.length && !erro && <p className="text-sm text-[#6B7488]">Nenhum outro atendente com a permissão de atender clientes.</p>}
            <label className="block"><span className={rotulo}>Observação para o colega</span><textarea className="mt-1 w-full rounded-xl bg-[#F1F4F8] px-3.5 py-3 text-[15px] outline-none" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} placeholder="Ex.: a família quer falar sobre translado" /></label>
            <p className="text-[13.5px] text-[#5B6478]">Você continua acompanhando a conversa, mas sem responder. Para voltar a falar, ela precisa ser transferida de novo para você.</p>
        </Janela>
    );
}

/** Membros do grupo: renomear, adicionar, remover, promover e sair. */
export function DetalhesGrupo({ conversa, perfil, onFechar, onMudou, onSaiu }: { conversa: Conversa; perfil: Perfil; onFechar: () => void; onMudou: (c: Conversa) => void; onSaiu: () => void }) {
    const souAdmin = conversa.meu_papel === "admin";
    const [nome, setNome] = useState(conversa.titulo);
    const [colegas, setColegas] = useState<Colega[]>([]);
    const [novo, setNovo] = useState(0);
    const [erro, setErro] = useState("");
    useEffect(() => {
        if (souAdmin) msgGet<Colega[]>("usuarios").then(setColegas).catch(() => {});
    }, [souAdmin]);
    const editar = async (corpo: Record<string, any>) => {
        try {
            onMudou((await msgPost("grupo_editar", { conversa_id: conversa.id, ...corpo })).dados);
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const sair = async () => {
        if (!window.confirm("Sair do grupo? Você deixa de ver as mensagens dele.")) return;
        try {
            await msgPost("sair_grupo", { conversa_id: conversa.id });
            onSaiu();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const fora = colegas.filter((c) => !conversa.membros.some((m) => m.usuario_id === c.id));
    return (
        <Janela titulo="Detalhes do grupo" sub={`${conversa.membros.length} membros`} onFechar={onFechar} rodape={<button type="button" className="h-11 rounded-xl border border-[#B42318] bg-white px-4 text-sm font-bold text-[#B42318]" onClick={sair}>Sair do grupo</button>}>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
            {souAdmin && (
                <div className="flex gap-2">
                    <input className="h-11 min-w-0 flex-1 rounded-xl bg-[#F1F4F8] px-3.5 text-[15px] outline-none" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do grupo" maxLength={120} />
                    <button type="button" className={btn} disabled={!nome.trim() || nome === conversa.titulo} onClick={() => editar({ operacao: "renomear", titulo: nome })}>Renomear</button>
                </div>
            )}
            <span className={rotulo}>Membros</span>
            {conversa.membros.map((m) => (
                <div key={m.usuario_id} className="flex items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 py-2 text-[15px] font-bold">
                    <span className="flex-1">{m.nome}{m.usuario_id === perfil.id ? " (você)" : ""}</span>
                    {m.papel === "admin" && <span className="rounded-full bg-[#F2CB3F] px-2 py-0.5 text-xs font-extrabold">Admin</span>}
                    {souAdmin && m.usuario_id !== perfil.id && (
                        <>
                            <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-[#EEF2F7]" onClick={() => editar({ operacao: m.papel === "admin" ? "rebaixar" : "promover", usuario_id: m.usuario_id })}>{m.papel === "admin" ? "Tirar admin" : "Tornar admin"}</button>
                            <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-[#B42318] hover:bg-[#FDECEA]" onClick={() => editar({ operacao: "remover", usuario_ids: [m.usuario_id] })}>Remover</button>
                        </>
                    )}
                </div>
            ))}
            {souAdmin && fora.length > 0 && (
                <div className="flex gap-2">
                    <select className="h-11 min-w-0 flex-1 rounded-xl border border-[#E1E5EC] bg-white px-3 text-sm font-bold" value={novo} onChange={(e) => setNovo(Number(e.target.value))} aria-label="Adicionar colega">
                        <option value={0}>Adicionar colega…</option>
                        {fora.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <button type="button" className={btnPri} disabled={!novo} onClick={() => { editar({ operacao: "adicionar", usuario_ids: [novo] }); setNovo(0); }}>Adicionar</button>
                </div>
            )}
        </Janela>
    );
}
