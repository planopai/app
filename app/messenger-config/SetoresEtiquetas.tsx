"use client";

/**
 * Pacote 4A (15/10/2026): abas "Setores" e "Etiquetas" da tela Configurações do Messenger
 * (visual aprovado no mockup "Messenger · Setores e Etiquetas").
 * Servidor: messenger.php (setores, setor_salvar, etiquetas, etiqueta_salvar, etiqueta_apagar).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import type { Etiqueta, ExcecaoSetor, HorarioSetor, Setor } from "@/components/messenger/tipos";
import { Icone, SeloCor } from "../messenger/components/Lista";

const CORES = [
    ["Azul escuro", "#313C55"], ["Azul", "#3D6A99"], ["Verde", "#4C9A2A"], ["Amarelo", "#C9A21E"], ["Laranja", "#D9731A"],
    ["Vermelho", "#B42318"], ["Roxo", "#6B4FA0"], ["Rosa", "#C2477D"], ["Turquesa", "#1F8A8A"], ["Cinza", "#6B7488"],
] as const;
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const campo = "mt-1 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3.5 text-[16px] text-[#1F2638] outline-none focus:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnLink = "h-10 rounded-xl px-3 text-sm font-extrabold text-[#3D6A99] hover:bg-[#E9EFF6] dark:text-[#A9BED6] dark:hover:bg-white/10";

type Aviso = (msg: string, erro?: boolean) => void;

function Interruptor({ ligado, onMudar, texto }: { ligado: boolean; onMudar: (v: boolean) => void; texto: string }) {
    return (
        <button type="button" aria-pressed={ligado} onClick={() => onMudar(!ligado)} className={`flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-extrabold ${ligado ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#DCEBAA]" : "border border-[#E1E5EC] text-[#4A5468] dark:border-white/15 dark:text-[#AEB9CF]"}`}>
            <span className={`relative inline-block h-[22px] w-10 rounded-full ${ligado ? "bg-[#4C9A2A]" : "bg-[#C9D1DE] dark:bg-white/25"}`}>
                <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${ligado ? "left-[21px]" : "left-[3px]"}`} />
            </span>
            {texto}
        </button>
    );
}

function Cores({ valor, onMudar }: { valor: string; onMudar: (c: string) => void }) {
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {CORES.map(([nome, cor]) => (
                <button key={cor} type="button" aria-label={nome} aria-pressed={valor.toUpperCase() === cor} onClick={() => onMudar(cor)} className="h-9 w-9 rounded-full" style={{ background: cor, outline: valor.toUpperCase() === cor ? "3px solid #1F2638" : "none", outlineOffset: 2 }} />
            ))}
        </div>
    );
}

/* ============================== SETORES ============================== */

type Rascunho = Omit<Setor, "aberto" | "situacao" | "membros"> & { membros: number[] };
const SETOR_NOVO: Rascunho = { id: 0, nome: "", cor: "#3D6A99", ativo: true, plantao: false, ordem: 0, msg_boas_vindas: "", msg_fora_horario: "", membros: [], horarios: [], excecoes: [] };

export function AbaSetores({ podeEditar, avisar }: { podeEditar: boolean; avisar: Aviso }) {
    const [setores, setSetores] = useState<Setor[]>([]);
    const [usuarios, setUsuarios] = useState<{ id: number; nome: string; atendente: boolean }[]>([]);
    const [edit, setEdit] = useState<Rascunho | null>(null);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const [d, us, eu] = await Promise.all([
                msgGet<{ setores: Setor[] }>("setores"),
                msgGet<{ id: number; nome: string; atendente_whatsapp: boolean }[]>("usuarios").catch(() => []),
                msgGet<{ id: number; nome: string; atendente: boolean }>("perfil").catch(() => null),
            ]);
            setSetores(d.setores);
            const lista = us.map((u) => ({ id: u.id, nome: u.nome, atendente: u.atendente_whatsapp }));
            if (eu && !lista.some((u) => u.id === eu.id)) lista.push({ id: eu.id, nome: eu.nome, atendente: eu.atendente });
            setUsuarios(lista.sort((a, b) => a.nome.localeCompare(b.nome)));
        } catch (e: any) {
            avisar(e.message, true);
        }
    }, [avisar]);
    useEffect(() => {
        carregar();
    }, [carregar]);

    const abrir = (s: Setor) => setEdit({ ...s, msg_boas_vindas: s.msg_boas_vindas || "", msg_fora_horario: s.msg_fora_horario || "", membros: s.membros.map((m) => m.id) });
    const mudar = (p: Partial<Rascunho>) => setEdit((e) => (e ? { ...e, ...p } : e));
    const faixasDoDia = (dia: number) => (edit?.horarios || []).map((h, i) => ({ ...h, i })).filter((h) => h.dia === dia);
    const mudarFaixa = (i: number, p: Partial<HorarioSetor>) => mudar({ horarios: edit!.horarios.map((h, j) => (j === i ? { ...h, ...p } : h)) });
    const mudarExcecao = (i: number, p: Partial<ExcecaoSetor>) => mudar({ excecoes: edit!.excecoes.map((x, j) => (j === i ? { ...x, ...p } : x)) });

    const salvar = async () => {
        if (!edit) return;
        setSalvando(true);
        try {
            const r = await msgPost("setor_salvar", edit);
            setSetores(r.dados.setores);
            const novo = (r.dados.setores as Setor[]).find((x) => x.id === r.dados.id);
            if (novo) abrir(novo);
            avisar(r.msg);
        } catch (e: any) {
            avisar(e.message, true);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="flex flex-wrap items-start gap-4">
            <section aria-label="Setores" className={`${cartao} flex w-full flex-col gap-2 md:w-[360px] md:flex-none`}>
                <div className="flex items-center gap-2 pb-1">
                    <h2 className="m-0 flex-1 text-lg font-extrabold">Setores</h2>
                    {podeEditar && <button type="button" className={btnPri} onClick={() => setEdit({ ...SETOR_NOVO, ordem: setores.length + 1, horarios: [] })}>+ Novo setor</button>}
                </div>
                {!setores.length && <p className="text-[15px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhum setor cadastrado. Enquanto não houver setores, todos os atendentes veem todos os clientes da fila.</p>}
                {setores.map((s) => (
                    <button key={s.id} type="button" onClick={() => abrir(s)} aria-pressed={edit?.id === s.id} className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left ${edit?.id === s.id ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "border-transparent bg-[#F6F8FB] dark:bg-[#1C2334]"} ${s.ativo ? "" : "opacity-60"}`}>
                        <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: s.cor }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-extrabold">{s.nome}</span>
                            <span className="block truncate text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{s.membros.length ? `${s.membros.length} atendente${s.membros.length > 1 ? "s" : ""}` : "Sem atendentes: avisa todos"}</span>
                        </span>
                        <span className={`flex-none rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${s.aberto ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#DCEBAA]" : "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"}`}>{s.situacao}</span>
                    </button>
                ))}
            </section>

            {edit ? (
                <section aria-label="Editar setor" className={`${cartao} flex min-w-0 flex-1 basis-[520px] flex-col gap-5`}>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="h-4 w-4 rounded-full" style={{ background: edit.cor }} aria-hidden="true" />
                        <h2 className="m-0 flex-1 text-xl font-extrabold">{edit.id ? edit.nome || "Setor" : "Novo setor"}</h2>
                        <Interruptor ligado={edit.ativo} onMudar={(v) => mudar({ ativo: v })} texto={edit.ativo ? "Ativo" : "Inativo"} />
                    </div>
                    <fieldset disabled={!podeEditar} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
                        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                            <label className="block"><span className={rotulo}>Nome do setor</span><input className={`${campo} h-12`} value={edit.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} placeholder="Ex.: Administrativo" /></label>
                            <label className="block"><span className={rotulo}>Número no menu</span><input className={`${campo} h-12`} type="number" min={0} max={99} value={edit.ordem} onChange={(e) => mudar({ ordem: Number(e.target.value) || 0 })} /></label>
                        </div>
                        <div><span className={rotulo}>Cor</span><Cores valor={edit.cor} onMudar={(c) => mudar({ cor: c })} /></div>

                        <div>
                            <span className={rotulo}>Atendentes deste setor</span>
                            <p className="mb-2 mt-1 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Eles recebem os clientes da fila deste setor. Sem ninguém marcado, todos os atendentes recebem.</p>
                            <div className="flex flex-wrap gap-2">
                                {usuarios.map((u) => {
                                    const marcado = edit.membros.includes(u.id);
                                    return (
                                        <label key={u.id} className={`flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-[14.5px] font-bold ${marcado ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "border-[#E1E5EC] dark:border-white/15"} ${u.atendente ? "" : "opacity-60"}`} title={u.atendente ? "" : "Sem a página de atender clientes"}>
                                            <input type="checkbox" className="h-4 w-4 accent-[#313C55]" checked={marcado} onChange={() => mudar({ membros: marcado ? edit.membros.filter((x) => x !== u.id) : [...edit.membros, u.id] })} />
                                            {u.nome}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className={`${rotulo} flex-1`}>Horário de funcionamento</span>
                                <Interruptor ligado={edit.plantao} onMudar={(v) => mudar({ plantao: v })} texto="Plantão 24 horas" />
                            </div>
                            {!edit.plantao && (
                                <div className="overflow-hidden rounded-2xl border border-[#E1E5EC] dark:border-white/12">
                                    {ORDEM_DIAS.map((dia) => {
                                        const faixas = faixasDoDia(dia);
                                        return (
                                            <div key={dia} className="flex flex-wrap items-center gap-2 border-b border-[#EEF0F3] px-3 py-2.5 last:border-b-0 dark:border-white/10">
                                                <span className="w-24 flex-none text-[15px] font-extrabold">{DIAS[dia]}</span>
                                                {!faixas.length && <span className="text-[14.5px] font-bold text-[#6B7488] dark:text-[#AEB9CF]">Fechado</span>}
                                                {faixas.map((f) => (
                                                    <span key={f.i} className="flex items-center gap-1.5 rounded-xl bg-[#F0F2F5] px-2 py-1 dark:bg-[#1C2334]">
                                                        <input type="time" aria-label={`${DIAS[dia]}: início`} className="h-9 rounded-lg bg-transparent px-1 text-[15px] font-bold outline-none" value={f.inicio} onChange={(e) => mudarFaixa(f.i, { inicio: e.target.value })} />
                                                        <span className="text-[13px] text-[#6B7488]">até</span>
                                                        <input type="time" aria-label={`${DIAS[dia]}: fim`} className="h-9 rounded-lg bg-transparent px-1 text-[15px] font-bold outline-none" value={f.fim} onChange={(e) => mudarFaixa(f.i, { fim: e.target.value })} />
                                                        <button type="button" aria-label="Tirar esta faixa" onClick={() => mudar({ horarios: edit.horarios.filter((_, j) => j !== f.i) })} className="flex h-8 w-8 items-center justify-center rounded-full text-[#5B6478] hover:bg-black/5"><Icone nome="x" className="h-4 w-4" /></button>
                                                    </span>
                                                ))}
                                                <button type="button" className={btnLink} onClick={() => mudar({ horarios: [...edit.horarios, { dia, inicio: faixas.length ? "14:00" : "08:00", fim: faixas.length ? "18:00" : "12:00" }] })}>+ faixa</button>
                                                {dia === 1 && faixas.length > 0 && (
                                                    <button type="button" className={btnLink} onClick={() => mudar({ horarios: [...edit.horarios.filter((h) => h.dia === 1 || h.dia === 0 || h.dia === 6), ...[2, 3, 4, 5].flatMap((d) => faixas.map((f) => ({ dia: d, inicio: f.inicio, fim: f.fim })))] })}>Copiar para terça a sexta</button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <span className={`${rotulo} flex-1`}>Feriados e exceções</span>
                                <button type="button" className={btnLink} onClick={() => mudar({ excecoes: [...edit.excecoes, { data: new Date().toISOString().slice(0, 10), descricao: "", fechado: true, inicio: null, fim: null }] })}>+ Adicionar data</button>
                            </div>
                            {!edit.excecoes.length && <p className="text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma data especial.</p>}
                            {edit.excecoes.map((x, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F6F8FB] p-2 dark:bg-[#1C2334]">
                                    <input type="date" aria-label="Data" className="h-10 rounded-lg border border-[#E1E5EC] bg-white px-2 text-[15px] dark:border-white/12 dark:bg-[#232B3F]" value={x.data} onChange={(e) => mudarExcecao(i, { data: e.target.value })} />
                                    <input aria-label="Descrição" placeholder="Ex.: Finados" className="h-10 min-w-[140px] flex-1 rounded-lg border border-[#E1E5EC] bg-white px-2 text-[15px] dark:border-white/12 dark:bg-[#232B3F]" value={x.descricao || ""} onChange={(e) => mudarExcecao(i, { descricao: e.target.value })} />
                                    <label className="flex items-center gap-1.5 text-[14px] font-bold"><input type="checkbox" className="h-4 w-4 accent-[#313C55]" checked={x.fechado} onChange={(e) => mudarExcecao(i, { fechado: e.target.checked, inicio: e.target.checked ? null : "08:00", fim: e.target.checked ? null : "12:00" })} />Fechado</label>
                                    {!x.fechado && (
                                        <>
                                            <input type="time" aria-label="Início" className="h-10 rounded-lg border border-[#E1E5EC] bg-white px-2 text-[15px] dark:border-white/12 dark:bg-[#232B3F]" value={x.inicio || ""} onChange={(e) => mudarExcecao(i, { inicio: e.target.value })} />
                                            <span className="text-[13px]">até</span>
                                            <input type="time" aria-label="Fim" className="h-10 rounded-lg border border-[#E1E5EC] bg-white px-2 text-[15px] dark:border-white/12 dark:bg-[#232B3F]" value={x.fim || ""} onChange={(e) => mudarExcecao(i, { fim: e.target.value })} />
                                        </>
                                    )}
                                    <button type="button" aria-label="Tirar esta data" onClick={() => mudar({ excecoes: edit.excecoes.filter((_, j) => j !== i) })} className="flex h-9 w-9 items-center justify-center rounded-full text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92]"><Icone nome="trash" className="h-4 w-4" /></button>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block"><span className={rotulo}>Mensagem de boas-vindas do setor</span><textarea className={`${campo} py-3`} rows={4} value={edit.msg_boas_vindas || ""} onChange={(e) => mudar({ msg_boas_vindas: e.target.value })} placeholder="Olá! Você está falando com o Administrativo do Plano PAI…" /></label>
                            <label className="block"><span className={rotulo}>Mensagem fora do horário</span><textarea className={`${campo} py-3`} rows={4} value={edit.msg_fora_horario || ""} onChange={(e) => mudar({ msg_fora_horario: e.target.value })} placeholder="Nosso atendimento abre {proximo_horario}. Sua mensagem ficou registrada." /></label>
                        </div>
                        <p className="-mt-3 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">As mensagens automáticas passam a ser enviadas com o pacote de Mensagens automáticas. Na mensagem fora do horário, <b>{"{proximo_horario}"}</b> vira o próximo horário de abertura (ex.: "amanhã às 08:00").</p>
                    </fieldset>
                    {podeEditar ? (
                        <div className="flex justify-end gap-2 border-t border-[#EEF0F3] pt-4 dark:border-white/10">
                            <button type="button" className={btnSec} onClick={() => setEdit(null)}>Cancelar</button>
                            <button type="button" className={btnPri} disabled={salvando || !edit.nome.trim()} onClick={salvar}>{salvando ? "Salvando…" : "Salvar setor"}</button>
                        </div>
                    ) : (
                        <p className="text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">Só quem tem a página "Messenger · Configurações" altera os setores.</p>
                    )}
                </section>
            ) : (
                <section className={`${cartao} flex min-w-0 flex-1 basis-[520px] items-center justify-center text-center text-[15px] text-[#5B6478] dark:text-[#AEB9CF]`} style={{ minHeight: 220 }}>
                    Escolha um setor para ver ou alterar os atendentes e os horários.
                </section>
            )}
        </div>
    );
}

/* ============================== ETIQUETAS ============================== */

export function AbaEtiquetas({ podeEditar, avisar }: { podeEditar: boolean; avisar: Aviso }) {
    const [lista, setLista] = useState<Etiqueta[]>([]);
    const [edit, setEdit] = useState<{ id: number; nome: string; cor: string; pessoal: boolean; quando_usar?: string }>({ id: 0, nome: "", cor: "#3D6A99", pessoal: !podeEditar, quando_usar: "" });
    const carregar = useCallback(() => {
        msgGet<Etiqueta[]>("etiquetas").then(setLista).catch((e) => avisar(e.message, true));
    }, [avisar]);
    useEffect(() => {
        carregar();
    }, [carregar]);
    useEffect(() => setEdit((e) => (e.id ? e : { ...e, pessoal: !podeEditar })), [podeEditar]);
    const salvar = async () => {
        try {
            const r = await msgPost("etiqueta_salvar", edit);
            avisar(r.msg);
            setEdit({ id: 0, nome: "", cor: "#3D6A99", pessoal: !podeEditar });
            carregar();
        } catch (e: any) {
            avisar(e.message, true);
        }
    };
    const apagar = async (e: Etiqueta) => {
        if (!window.confirm(`Apagar a etiqueta "${e.nome}"? Ela sai de ${e.uso} conversa(s).`)) return;
        try {
            const r = await msgPost("etiqueta_apagar", { id: e.id });
            avisar(r.msg);
            carregar();
        } catch (x: any) {
            avisar(x.message, true);
        }
    };
    const podeMexer = (e: Etiqueta) => (e.pessoal ? true : podeEditar);
    return (
        <div className="flex flex-wrap items-start gap-4">
            <section aria-label="Etiquetas cadastradas" className={`${cartao} flex min-w-0 flex-1 basis-[480px] flex-col`}>
                <div className="flex items-center gap-2 pb-2">
                    <h2 className="m-0 flex-1 text-lg font-extrabold">Etiquetas</h2>
                    <span className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{lista.length} etiqueta{lista.length === 1 ? "" : "s"}</span>
                </div>
                {!lista.length && <p className="text-[15px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma etiqueta cadastrada.</p>}
                {lista.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 border-t border-[#EEF0F3] py-2.5 dark:border-white/10">
                        <SeloCor nome={e.nome} cor={e.cor} ponto />
                        <span className="min-w-0 flex-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Usada em {e.uso} {e.uso === 1 ? "conversa" : "conversas"}{e.quando_usar && <span className="block truncate text-[13px] italic" title={e.quando_usar}>{e.quando_usar}</span>}</span>
                        <span className="flex-none rounded-lg bg-[#F0F2F5] px-2 py-0.5 text-[12px] font-extrabold text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]">{e.pessoal ? "Minha" : "Empresa"}</span>
                        {podeMexer(e) && (
                            <>
                                <button type="button" aria-label={`Editar ${e.nome}`} onClick={() => setEdit({ id: e.id, nome: e.nome, cor: e.cor, pessoal: e.pessoal, quando_usar: e.quando_usar || "" })} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#F0F2F5] dark:hover:bg-white/10"><Icone nome="editar" className="h-5 w-5" /></button>
                                <button type="button" aria-label={`Apagar ${e.nome}`} onClick={() => apagar(e)} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-white/10"><Icone nome="trash" className="h-5 w-5" /></button>
                            </>
                        )}
                    </div>
                ))}
            </section>
            <section aria-label={edit.id ? "Editar etiqueta" : "Nova etiqueta"} className={`${cartao} flex w-full flex-col gap-4 md:w-[380px] md:flex-none`}>
                <h2 className="m-0 text-lg font-extrabold">{edit.id ? "Editar etiqueta" : "Nova etiqueta"}</h2>
                <label className="block"><span className={rotulo}>Nome</span><input className={`${campo} h-12`} value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} maxLength={60} placeholder="Ex.: Retornar ligação" /></label>
                <div><span className={rotulo}>Cor</span><Cores valor={edit.cor} onMudar={(c) => setEdit({ ...edit, cor: c })} /></div>
                <label className="block"><span className={rotulo}>Quando usar</span><textarea className={`${campo} py-3`} rows={3} maxLength={400} value={edit.quando_usar || ""} onChange={(e) => setEdit({ ...edit, quando_usar: e.target.value })} placeholder="Ex.: cliente mandou comprovante de Pix ou transferência. Não usar para pedido de boleto." /><span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Orienta a equipe e, quando a Aurora entrar, ela usa este texto para etiquetar as conversas.</span></label>
                {!edit.id && (
                    <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                        <legend className={`${rotulo} mb-2`}>Quem usa</legend>
                        <label className={`flex h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-bold ${!edit.pessoal ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "bg-[#F0F2F5] dark:bg-[#1C2334]"} ${podeEditar ? "" : "opacity-50"}`}><input type="radio" name="dono" disabled={!podeEditar} checked={!edit.pessoal} onChange={() => setEdit({ ...edit, pessoal: false })} className="h-4 w-4 accent-[#313C55]" />Toda a empresa</label>
                        <label className={`flex h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-bold ${edit.pessoal ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "bg-[#F0F2F5] dark:bg-[#1C2334]"}`}><input type="radio" name="dono" checked={edit.pessoal} onChange={() => setEdit({ ...edit, pessoal: true })} className="h-4 w-4 accent-[#313C55]" />Só eu</label>
                    </fieldset>
                )}
                <div className="flex items-center gap-2"><span className="text-[13.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">Prévia</span><SeloCor nome={edit.nome || "Etiqueta"} cor={edit.cor} ponto /></div>
                <div className="flex gap-2">
                    {edit.id > 0 && <button type="button" className={btnSec} onClick={() => setEdit({ id: 0, nome: "", cor: "#3D6A99", pessoal: !podeEditar })}>Cancelar</button>}
                    <button type="button" className={`${btnPri} flex-1`} disabled={!edit.nome.trim()} onClick={salvar}>{edit.id ? "Salvar" : "Criar etiqueta"}</button>
                </div>
            </section>
        </div>
    );
}
