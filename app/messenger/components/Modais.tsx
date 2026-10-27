"use client";

import React, { useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import type { Conversa, Etiqueta, Perfil, Setor } from "@/components/messenger/tipos";
import { Avatar, Icone, SeloCor } from "./Lista";

function Janela({ titulo, sub, onFechar, children, rodape }: { titulo: string; sub?: string; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" style={{ background: "rgba(49,60,85,0.45)" }} onClick={onFechar}>
            <div role="dialog" aria-label={titulo} className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3 border-b border-[#E3E8F0] px-6 py-5 dark:border-white/12">
                    <div className="flex-1"><h2 className="m-0 text-xl font-extrabold">{titulo}</h2>{sub && <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">{sub}</p>}</div>
                    <button type="button" onClick={onFechar} className="flex h-11 w-11 items-center justify-center" aria-label="Fechar"><Icone nome="x" /></button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5">{children}</div>
                {rodape && <div className="flex justify-end gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-6 py-4 dark:border-white/12 dark:bg-[#1C2334]">{rodape}</div>}
            </div>
        </div>
    );
}
const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";

type Colega = { id: number; nome: string; atendente_whatsapp: boolean };

/** Nova conversa individual ou novo grupo. */
export function NovaConversa({ grupoInicial, onFechar, onAberta, online = () => false, onWhatsApp }: { grupoInicial: boolean; onFechar: () => void; onAberta: (c: Conversa) => void; online?: (usuarioId: number) => boolean; onWhatsApp?: () => void }) {
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
            <div className="flex gap-1 rounded-[14px] bg-[#F1F4F8] p-1 dark:bg-[#1C2334]">
                {(["colega", "grupo"] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={`h-10 flex-1 rounded-[10px] text-sm font-extrabold ${modo === m ? "bg-white shadow-sm dark:bg-[#232B3F]" : "text-[#6B7488] dark:text-[#AEB9CF]"}`}>{m === "colega" ? "Conversa" : "Grupo"}</button>
                ))}
                {onWhatsApp && <button type="button" onClick={onWhatsApp} className="h-10 flex-1 rounded-[10px] text-sm font-extrabold text-[#6B7488] dark:text-[#AEB9CF]">WhatsApp</button>}
            </div>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
            {modo === "grupo" && (
                <label className="block"><span className={rotulo}>Nome do grupo</span><input className="mt-1 h-12 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none dark:bg-[#1C2334]" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plantão de domingo" maxLength={120} /></label>
            )}
            <label className="flex h-12 flex-none items-center gap-3 rounded-full bg-[#F0F2F5] px-4 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <Icone nome="search" />
                <input type="search" className="min-w-0 flex-1 bg-transparent text-[17px] text-[#1F2638] outline-none dark:text-white" placeholder="Buscar colega" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar colega" />
            </label>
            <div className="flex flex-col">
                {filtrados.map((c) =>
                    modo === "colega" ? (
                        <button key={c.id} type="button" disabled={salvando} onClick={() => abrir(c.id)} className="flex min-h-[64px] items-center gap-3.5 rounded-xl px-2 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                            <Avatar conversa={{ id: c.id, tipo: "individual", titulo: c.nome }} tamanho={46} online={online(c.id)} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[17px] font-extrabold text-[#1F2638] dark:text-white">{c.nome}</span>
                                {online(c.id) && <span className="block text-[13.5px] font-semibold text-[#4C9A2A] dark:text-[#B3CE52]">online</span>}
                            </span>
                        </button>
                    ) : (
                        <label key={c.id} className="flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-xl px-2 text-[17px] font-extrabold hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                            <input type="checkbox" className="h-5 w-5 flex-none accent-[#313C55]" checked={marcados.includes(c.id)} onChange={(e) => setMarcados(e.target.checked ? [...marcados, c.id] : marcados.filter((x) => x !== c.id))} />
                            <Avatar conversa={{ id: c.id, tipo: "individual", titulo: c.nome }} tamanho={42} online={online(c.id)} />
                            <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                        </label>
                    )
                )}
                {!filtrados.length && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum colega encontrado.</p>}
            </div>
        </Janela>
    );
}

/** Transferir atendimento de cliente para outro atendente. Quem transfere passa a só acompanhar. */
export function Transferir({ conversa, onFechar, onFeito }: { conversa: Conversa; onFechar: () => void; onFeito: () => void }) {
    const [lista, setLista] = useState<{ usuario_id: number; nome: string; em_atendimento: number }[]>([]);
    const [para, setPara] = useState(0);
    // 15/10/2026: transferir para uma pessoa ou para a fila de um setor
    const [modo, setModo] = useState<"pessoa" | "setor">("pessoa");
    const [setores, setSetores] = useState<Setor[]>([]);
    const [setorId, setSetorId] = useState(0);
    const [obs, setObs] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        msgGet<any[]>("atendentes").then((l) => setLista(l.filter((a) => a.usuario_id !== conversa.responsavel?.id))).catch((e) => setErro(e.message));
        msgGet<{ setores: Setor[] }>("setores").then((d) => setSetores(d.setores.filter((x) => x.ativo))).catch(() => setSetores([]));
    }, [conversa.responsavel?.id]);
    const confirmar = async () => {
        setSalvando(true);
        try {
            if (modo === "setor") await msgPost("transferir_setor", { conversa_id: conversa.id, setor_id: setorId, observacao: obs });
            else await msgPost("transferir", { conversa_id: conversa.id, para_usuario_id: para, observacao: obs });
            onFeito();
        } catch (e: any) {
            setErro(e.message);
            setSalvando(false);
        }
    };
    return (
        <Janela titulo="Transferir conversa" sub={`${conversa.titulo} · o novo responsável recebe todo o atendimento em andamento.`} onFechar={onFechar}
            rodape={<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={(modo === "pessoa" ? !para : !setorId) || salvando} onClick={confirmar}>Transferir</button></>}>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
            {setores.length > 0 && (
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]" role="tablist">
                    {(["pessoa", "setor"] as const).map((m) => (
                        <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)} className={`h-10 rounded-xl text-sm font-extrabold ${modo === m ? "bg-white shadow dark:bg-[#3D6A99]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{m === "pessoa" ? "Para uma pessoa" : "Para um setor"}</button>
                    ))}
                </div>
            )}
            {modo === "setor" ? (
                <>
                    <span className={rotulo}>O cliente volta para a fila do setor e os atendentes dele são avisados</span>
                    {setores.map((x) => (
                        <label key={x.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-[15px] font-bold dark:border-white/12">
                            <input type="radio" name="setor" className="h-5 w-5 accent-[#313C55]" checked={setorId === x.id} onChange={() => setSetorId(x.id)} />
                            <span className="h-3 w-3 flex-none rounded-full" style={{ background: x.cor }} aria-hidden="true" />
                            <span className="flex-1">{x.nome}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${x.aberto ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#DCEBAA]" : "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"}`}>{x.situacao}</span>
                        </label>
                    ))}
                </>
            ) : (
            <>
            <span className={rotulo}>Transferir para (atendentes do WhatsApp)</span>
            {lista.map((a) => (
                <label key={a.usuario_id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-[15px] font-bold dark:border-white/12">
                    <input type="radio" name="para" className="h-5 w-5 accent-[#313C55]" checked={para === a.usuario_id} onChange={() => setPara(a.usuario_id)} />
                    <span className="flex-1">{a.nome}</span>
                    <span className="rounded-full bg-[#E9EFF6] px-2 py-0.5 text-xs font-extrabold dark:bg-[#3D6A99]/20">{a.em_atendimento} em atendimento</span>
                </label>
            ))}
            {!lista.length && !erro && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum outro atendente com a permissão de atender clientes.</p>}
            </>
            )}
            <label className="block"><span className={rotulo}>Observação para o colega</span><textarea className="mt-1 w-full rounded-xl bg-[#F1F4F8] px-3.5 py-3 text-[16px] outline-none dark:bg-[#1C2334]" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} placeholder="Ex.: a família quer falar sobre translado" /></label>
            <p className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">A conversa sai da sua lista. O novo responsável vê todas as mensagens deste atendimento, inclusive as que você trocou com o cliente.</p>
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
        <Janela titulo="Detalhes do grupo" sub={`${conversa.membros.length} membros`} onFechar={onFechar} rodape={<button type="button" className="h-11 rounded-xl border border-[#B42318] bg-white px-4 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#232B3F] dark:text-[#FF9C92]" onClick={sair}>Sair do grupo</button>}>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
            {souAdmin && (
                <div className="flex gap-2">
                    <input className="h-11 min-w-0 flex-1 rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none dark:bg-[#1C2334]" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do grupo" maxLength={120} />
                    <button type="button" className={btn} disabled={!nome.trim() || nome === conversa.titulo} onClick={() => editar({ operacao: "renomear", titulo: nome })}>Renomear</button>
                </div>
            )}
            <span className={rotulo}>Membros</span>
            {conversa.membros.map((m) => (
                <div key={m.usuario_id} className="flex items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 py-2 text-[15px] font-bold dark:border-white/12">
                    <span className="flex-1">{m.nome}{m.usuario_id === perfil.id ? " (você)" : ""}</span>
                    {m.papel === "admin" && <span className="rounded-full bg-[#F2CB3F] px-2 py-0.5 text-xs font-extrabold">Admin</span>}
                    {souAdmin && m.usuario_id !== perfil.id && (
                        <>
                            <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-[#EEF2F7] dark:hover:bg-white/10" onClick={() => editar({ operacao: m.papel === "admin" ? "rebaixar" : "promover", usuario_id: m.usuario_id })}>{m.papel === "admin" ? "Tirar admin" : "Tornar admin"}</button>
                            <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15" onClick={() => editar({ operacao: "remover", usuario_ids: [m.usuario_id] })}>Remover</button>
                        </>
                    )}
                </div>
            ))}
            {souAdmin && fora.length > 0 && (
                <div className="flex gap-2">
                    <select className="h-11 min-w-0 flex-1 rounded-xl border border-[#E1E5EC] bg-white px-3 text-sm font-bold dark:border-white/12 dark:bg-[#232B3F]" value={novo} onChange={(e) => setNovo(Number(e.target.value))} aria-label="Adicionar colega">
                        <option value={0}>Adicionar colega…</option>
                        {fora.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <button type="button" className={btnPri} disabled={!novo} onClick={() => { editar({ operacao: "adicionar", usuario_ids: [novo] }); setNovo(0); }}>Adicionar</button>
                </div>
            )}
        </Janela>
    );
}

/** Pacote 3: enviar um contato (cliente já conhecido ou digitado). No WhatsApp vai como cartão de contato. */
export function EnviarContato({ onFechar, onEnviar }: { onFechar: () => void; onEnviar: (nome: string, telefone: string) => void }) {
    const [busca, setBusca] = useState("");
    const [lista, setLista] = useState<{ id: number; nome: string | null; telefone: string }[]>([]);
    const [nome, setNome] = useState("");
    const [telefone, setTelefone] = useState("");
    useEffect(() => {
        const t = setTimeout(() => {
            msgGet<any[]>("contatos", { q: busca }).then(setLista).catch(() => setLista([]));
        }, 250);
        return () => clearTimeout(t);
    }, [busca]);
    const digitos = telefone.replace(/\D/g, "");
    return (
        <Janela titulo="Enviar contato" sub="Escolha um cliente ou digite o nome e o telefone." onFechar={onFechar}
            rodape={<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={!nome.trim() || digitos.length < 10} onClick={() => onEnviar(nome.trim(), digitos)}>Enviar contato</button></>}>
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="block"><span className={rotulo}>Nome</span><input className="mt-1 h-12 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none dark:bg-[#1C2334]" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" maxLength={120} /></label>
                <label className="block"><span className={rotulo}>Telefone com DDD</span><input className="mt-1 h-12 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none dark:bg-[#1C2334]" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(77) 99999-9999" inputMode="tel" /></label>
            </div>
            <label className="mt-1 flex h-12 flex-none items-center gap-3 rounded-full bg-[#F0F2F5] px-4 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <Icone nome="search" />
                <input type="search" className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1F2638] outline-none dark:text-white" placeholder="Buscar cliente por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
            </label>
            <div className="flex flex-col">
                {lista.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setNome(c.nome || ""); setTelefone(c.telefone.replace(/^\+55/, "")); }} className="flex min-h-[56px] items-center gap-3 rounded-xl px-2 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                        <Avatar conversa={{ id: c.id, tipo: "individual", titulo: c.nome || c.telefone }} tamanho={40} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-extrabold">{c.nome || "Sem nome"}</span><span className="block text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{c.telefone}</span></span>
                    </button>
                ))}
                {!lista.length && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum cliente encontrado. Digite o nome e o telefone acima.</p>}
            </div>
        </Janela>
    );
}

/** Pacote 3: encaminhar uma mensagem para até 10 conversas. */
export function Encaminhar({ conversas, onFechar, onEnviar }: { conversas: Conversa[]; onFechar: () => void; onEnviar: (ids: number[]) => void }) {
    const [busca, setBusca] = useState("");
    const [marcadas, setMarcadas] = useState<number[]>([]);
    const possiveis = conversas.filter((c) => c.participo && (c.tipo !== "externo" || (c.posso_responder && c.janela_aberta)));
    const filtradas = possiveis.filter((c) => c.titulo.toLowerCase().includes(busca.toLowerCase()));
    const alternar = (id: number) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length < 10 ? [...m, id] : m));
    return (
        <Janela titulo="Encaminhar mensagem" sub="Escolha até 10 conversas. Clientes só aparecem com a janela de 24 h aberta." onFechar={onFechar}
            rodape={<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={!marcadas.length} onClick={() => onEnviar(marcadas)}>Encaminhar{marcadas.length ? ` (${marcadas.length})` : ""}</button></>}>
            <label className="flex h-12 flex-none items-center gap-3 rounded-full bg-[#F0F2F5] px-4 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <Icone nome="search" />
                <input type="search" className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1F2638] outline-none dark:text-white" placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conversa" />
            </label>
            <div className="flex flex-col">
                {filtradas.map((c) => (
                    <label key={c.id} className="flex min-h-[60px] cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                        <input type="checkbox" className="h-5 w-5 flex-none accent-[#313C55]" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} />
                        <Avatar conversa={c} tamanho={42} />
                        <span className="min-w-0 flex-1 truncate text-[16.5px] font-extrabold">{c.titulo}</span>
                        {c.tipo === "externo" && <span className="flex-none rounded-full bg-[#EEF5D6] px-2 py-0.5 text-[11.5px] font-extrabold dark:bg-[#B3CE52]/15">Cliente</span>}
                    </label>
                ))}
                {!filtradas.length && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma conversa disponível.</p>}
            </div>
        </Janela>
    );
}


/** Pacote 4A: marcar as etiquetas da conversa. */
export function EtiquetasConversa({ conversa, onFechar, onSalvo }: { conversa: Conversa; onFechar: () => void; onSalvo: (c: Conversa) => void }) {
    const [lista, setLista] = useState<Etiqueta[] | null>(null);
    const [marcadas, setMarcadas] = useState<number[]>((conversa.etiquetas || []).map((e) => e.id));
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [max, setMax] = useState(4); // limite de etiquetas por conversa (Configurações › Geral)
    useEffect(() => {
        msgGet<{ max_etiquetas?: number }>("config", {}, false).then((c) => c.max_etiquetas && setMax(c.max_etiquetas)).catch(() => {});
    }, []);
    useEffect(() => {
        msgGet<Etiqueta[]>("etiquetas").then(setLista).catch((e) => setErro(e.message));
    }, []);
    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await msgPost("conversa_etiquetas", { conversa_id: conversa.id, etiqueta_ids: marcadas });
            onSalvo(r.dados);
        } catch (e: any) {
            setErro(e.message);
            setSalvando(false);
        }
    };
    return (
        <Janela titulo="Etiquetas" sub={conversa.titulo} onFechar={onFechar}
            rodape={<><button type="button" className={btn} onClick={onFechar}>Cancelar</button><button type="button" className={btnPri} disabled={salvando || !lista} onClick={salvar}>Salvar</button></>}>
            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
            {!lista && !erro && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Carregando…</p>}
            {lista && !lista.length && <p className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma etiqueta cadastrada. Crie em Messenger · Configurações › Etiquetas.</p>}
            {lista && lista.length > 0 && <p className={`text-[13.5px] font-bold ${marcadas.length >= max ? "text-[#8A6A00] dark:text-[#F7E39A]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{marcadas.length} de {max} etiquetas{marcadas.length >= max ? " — limite atingido. Tire uma para marcar outra." : ""}</p>}
            <div className="flex flex-col">
                {(lista || []).map((e) => (
                    <label key={e.id} className={`flex min-h-[54px] items-center gap-3 rounded-xl px-2 ${!marcadas.includes(e.id) && marcadas.length >= max ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[#EEF2F7] dark:hover:bg-white/10"}`}>
                        <input type="checkbox" className="h-5 w-5 flex-none accent-[#313C55]" checked={marcadas.includes(e.id)} disabled={!marcadas.includes(e.id) && marcadas.length >= max} onChange={() => setMarcadas((m) => (m.includes(e.id) ? m.filter((x) => x !== e.id) : m.length >= max ? m : [...m, e.id]))} />
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5"><SeloCor nome={e.nome} cor={e.cor} ponto />{e.quando_usar && <span className="text-[12.5px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{e.quando_usar}</span>}</span>
                        {e.pessoal && <span className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[12px] font-extrabold text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]">Minha</span>}
                    </label>
                ))}
            </div>
        </Janela>
    );
}
