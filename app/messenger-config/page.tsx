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
type Config = { assinatura: "completo" | "primeiro" | "nao"; max_fixadas: number; pode_editar: boolean; automaticas?: Record<string, string>; menu_previa?: string; precos?: Record<string, number> };

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const campo = "mt-1 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3.5 text-[16px] text-[#1F2638] outline-none focus:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white";

export default function MessengerConfigPage() {
    const [aba, setAba] = useState<"respostas" | "setores" | "etiquetas" | "automaticas" | "geral">("respostas");
    const [auto, setAuto] = useState<Record<string, string>>({});
    const [precos, setPrecos] = useState<Record<string, string>>({});
    // setores e etiquetas da empresa para os destinos de comprovante e áudio
    const [opcoes, setOpcoes] = useState<{ setores: { id: number; nome: string }[]; etiquetas: { id: number; nome: string }[] }>({ setores: [], etiquetas: [] });
    useEffect(() => {
        Promise.all([
            msgGet<{ setores: { id: number; nome: string; ativo: boolean }[] }>("setores", {}, false).catch(() => ({ setores: [] })),
            msgGet<{ id: number; nome: string; pessoal: boolean }[]>("etiquetas", {}, false).catch(() => []),
        ]).then(([a, b]: any[]) => setOpcoes({ setores: (a.setores || []).filter((x: any) => x.ativo), etiquetas: (Array.isArray(b) ? b : []).filter((x: any) => !x.pessoal) }));
    }, []);
    const [config, setConfig] = useState<Config | null>(null);
    const [respostas, setRespostas] = useState<Resposta[]>([]);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [editando, setEditando] = useState<Partial<Resposta> | null>(null);

    const carregar = useCallback(async () => {
        try {
            const [c, r] = await Promise.all([msgGet<Config>("config"), msgGet<Resposta[]>("respostas")]);
            setConfig(c);
            setAuto(c.automaticas || {});
            setPrecos(Object.fromEntries(Object.entries(c.precos || {}).map(([k, v]) => [k, String(v).replace(".", ",")])));
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
            const extra = (mudanca as any).precos ? { precos: (mudanca as any).precos } : {};
            const r = await msgPost("config_salvar", { assinatura: novo.assinatura, max_fixadas: novo.max_fixadas, ...extra });
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
                    {([["respostas", "Respostas rápidas"], ["setores", "Setores"], ["etiquetas", "Etiquetas"], ["automaticas", "Mensagens automáticas"], ["geral", "Geral"]] as const).map(([id, nome]) => (
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

                {aba === "automaticas" && config && (
                    <section className={`${cartao} flex flex-col gap-5`}>
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="m-0 flex-1 text-lg font-extrabold">Mensagens automáticas do WhatsApp</h2>
                            <LigaDesliga ligado={auto.auto_ativo === "1"} texto={auto.auto_ativo === "1" ? "Ligadas" : "Desligadas"} onMudar={(v) => setAuto({ ...auto, auto_ativo: v ? "1" : "0" })} desativado={!podeEmpresa} />
                        </div>
                        <p className="-mt-3 text-[14.5px] text-[#5B6478] dark:text-[#AEB9CF]">Quando ligadas, o cliente que inicia uma conversa recebe as boas-vindas e o menu de setores. Enquanto ele não escolhe, a fila não é avisada. Depois que um atendente assume, as automáticas param.</p>
                        <fieldset disabled={!podeEmpresa} className="m-0 flex flex-col gap-5 border-0 p-0">
                            <label className="block"><span className={rotulo}>Boas-vindas (primeira mensagem do cliente)</span><textarea className={`${campo} py-3`} rows={3} value={auto.auto_boas_vindas || ""} onChange={(e) => setAuto({ ...auto, auto_boas_vindas: e.target.value })} /></label>
                            <div className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] p-4 dark:border-white/12">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-1 text-[16px] font-extrabold">Menu de setores</span>
                                    <LigaDesliga ligado={auto.auto_menu_ativo === "1"} texto={auto.auto_menu_ativo === "1" ? "Ligado" : "Desligado"} onMudar={(v) => setAuto({ ...auto, auto_menu_ativo: v ? "1" : "0" })} desativado={!podeEmpresa} />
                                </div>
                                <label className="block"><span className={rotulo}>Texto antes das opções</span><input className={`${campo} h-12`} value={auto.auto_menu_texto || ""} onChange={(e) => setAuto({ ...auto, auto_menu_texto: e.target.value })} /></label>
                                <div>
                                    <span className={rotulo}>Como o cliente recebe (salvo)</span>
                                    <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-[#E3EFC0] p-3 font-[inherit] text-[15px] text-[#1F2638] dark:bg-[#3D6A99]/30 dark:text-white">{config.menu_previa || "Cadastre os setores na aba Setores."}</pre>
                                    <p className="mt-1 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">As opções vêm da aba Setores (ativos, pelo "número no menu"). Com um só setor ativo, o menu não aparece e o cliente cai direto nele.</p>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block"><span className={rotulo}>Quando responde algo que não é número</span><textarea className={`${campo} py-3`} rows={2} value={auto.auto_menu_invalida || ""} onChange={(e) => setAuto({ ...auto, auto_menu_invalida: e.target.value })} /></label>
                                    <label className="block"><span className={rotulo}>Depois de 2 tentativas (vai para a fila geral)</span><textarea className={`${campo} py-3`} rows={2} value={auto.auto_menu_desistiu || ""} onChange={(e) => setAuto({ ...auto, auto_menu_desistiu: e.target.value })} /></label>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] p-4 dark:border-white/12">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-1 text-[16px] font-extrabold">🧾 Comprovantes de pagamento</span>
                                    <LigaDesliga ligado={auto.comprovante_ativo === "1"} texto={auto.comprovante_ativo === "1" ? "Ligado" : "Desligado"} onMudar={(v) => setAuto({ ...auto, comprovante_ativo: v ? "1" : "0" })} desativado={!podeEmpresa} />
                                </div>
                                <p className="-mt-1 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Para quem paga por Pix direto no CNPJ: quando o cliente escreve "paguei", "comprovante", "fiz o pix"… (ou manda foto/PDF, se marcado abaixo), não passa pelo menu e vai direto para o setor escolhido.</p>
                                <label className="flex items-center gap-2 text-[15px] font-bold"><input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={auto.comprovante_midia === "1"} onChange={(e) => setAuto({ ...auto, comprovante_midia: e.target.checked ? "1" : "0" })} />Foto ou PDF no começo da conversa também conta como comprovante</label>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block"><span className={rotulo}>Enviar para o setor</span><select className={`${campo} h-12`} value={auto.comprovante_setor || ""} onChange={(e) => setAuto({ ...auto, comprovante_setor: e.target.value })}><option value="">Fila geral (todos)</option>{opcoes.setores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                                    <label className="block"><span className={rotulo}>Marcar a etiqueta</span><select className={`${campo} h-12`} value={auto.comprovante_etiqueta || ""} onChange={(e) => setAuto({ ...auto, comprovante_etiqueta: e.target.value })}><option value="">Nenhuma</option>{opcoes.etiquetas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                                </div>
                                <label className="block"><span className={rotulo}>Resposta ao cliente</span><textarea className={`${campo} py-3`} rows={2} value={auto.comprovante_resposta || ""} onChange={(e) => setAuto({ ...auto, comprovante_resposta: e.target.value })} /></label>
                            </div>
                            <div className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] p-4 dark:border-white/12">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-1 text-[16px] font-extrabold">🔊 Quem manda áudio</span>
                                    <LigaDesliga ligado={auto.audio_pular_menu === "1"} texto={auto.audio_pular_menu === "1" ? "Pula o menu" : "Usa o menu"} onMudar={(v) => setAuto({ ...auto, audio_pular_menu: v ? "1" : "0" })} desativado={!podeEmpresa} />
                                </div>
                                <p className="-mt-1 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Muitos associados não leem. Quem responde com áudio não fica preso no menu: vai direto para um atendente. (Com a Aurora, ela vai entender o áudio e escolher o setor.)</p>
                                <label className="block"><span className={rotulo}>Enviar para</span><select className={`${campo} h-12`} value={auto.audio_destino || ""} onChange={(e) => setAuto({ ...auto, audio_destino: e.target.value })}><option value="">Fila geral (todos)</option>{opcoes.setores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                                <label className="block"><span className={rotulo}>Resposta ao cliente</span><textarea className={`${campo} py-3`} rows={2} value={auto.audio_resposta || ""} onChange={(e) => setAuto({ ...auto, audio_resposta: e.target.value })} /></label>
                            </div>
                            <label className="block"><span className={rotulo}>Fora do horário (quando o setor não tem a sua própria)</span><textarea className={`${campo} py-3`} rows={3} value={auto.auto_fora_horario || ""} onChange={(e) => setAuto({ ...auto, auto_fora_horario: e.target.value })} /></label>
                            <p className="-mt-3 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]"><b>{"{proximo_horario}"}</b> vira o próximo horário de abertura do setor (ex.: "amanhã às 08:00") e <b>{"{setor}"}</b> o nome do setor.</p>
                            <div className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] p-4 dark:border-white/12">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-1 text-[16px] font-extrabold">Avaliação depois do atendimento</span>
                                    <LigaDesliga ligado={auto.avaliacao_ativa === "1"} texto={auto.avaliacao_ativa === "1" ? "Ligada" : "Desligada"} onMudar={(v) => setAuto({ ...auto, avaliacao_ativa: v ? "1" : "0" })} desativado={!podeEmpresa} />
                                </div>
                                <p className="-mt-1 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Ao encerrar, o cliente recebe a pergunta e responde com uma nota de 1 a 5. A nota aparece no Histórico de clientes (★). Só é enviada com a janela de 24 h aberta.</p>
                                <label className="block"><span className={rotulo}>Pergunta</span><textarea className={`${campo} py-3`} rows={2} value={auto.avaliacao_texto || ""} onChange={(e) => setAuto({ ...auto, avaliacao_texto: e.target.value })} /></label>
                                <label className="block"><span className={rotulo}>Agradecimento</span><input className={`${campo} h-12`} value={auto.avaliacao_obrigado || ""} onChange={(e) => setAuto({ ...auto, avaliacao_obrigado: e.target.value })} /></label>
                            </div>
                        </fieldset>
                        {podeEmpresa ? (
                            <div className="flex justify-end border-t border-[#EEF0F3] pt-4 dark:border-white/10">
                                <button type="button" className={btnPri} onClick={async () => { try { const r = await msgPost("config_salvar", { automaticas: auto }); avisar(r.msg); carregar(); } catch (e: any) { avisar(e.message, true); } }}>Salvar mensagens automáticas</button>
                            </div>
                        ) : (
                            <p className="text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">Só quem tem a página "Messenger · Configurações" altera as mensagens automáticas.</p>
                        )}
                    </section>
                )}

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
                        <div className="mt-6 border-t border-[#EEF0F3] pt-4 dark:border-white/10">
                            <span className={rotulo}>Preços da Meta por mensagem cobrada (R$) — usados no Monitoramento</span>
                            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {([["service", "Serviço (respostas na janela)"], ["utility", "Utilidade"], ["marketing", "Marketing"], ["authentication", "Autenticação"]] as const).map(([k, nome]) => (
                                    <label key={k} className="block"><span className="text-[13.5px] font-bold">{nome}</span><input inputMode="decimal" className={`${campo} h-12`} value={precos[k] ?? ""} disabled={!podeEmpresa} onChange={(e) => setPrecos({ ...precos, [k]: e.target.value })} onBlur={() => salvarGeral({ precos } as any)} /></label>
                                ))}
                            </div>
                            <p className="mt-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Quem diz se cada mensagem foi cobrada e de qual categoria é a própria Meta (no aviso de entrega). Aqui fica só o preço, para conferir com a fatura; a Meta muda a tabela de tempos em tempos.</p>
                        </div>
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

function LigaDesliga({ ligado, onMudar, texto, desativado }: { ligado: boolean; onMudar: (v: boolean) => void; texto: string; desativado?: boolean }) {
    return (
        <button type="button" aria-pressed={ligado} disabled={desativado} onClick={() => onMudar(!ligado)} className={`flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-extrabold disabled:opacity-50 ${ligado ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#DCEBAA]" : "border border-[#E1E5EC] text-[#4A5468] dark:border-white/15 dark:text-[#AEB9CF]"}`}>
            <span className={`relative inline-block h-[22px] w-10 rounded-full ${ligado ? "bg-[#4C9A2A]" : "bg-[#C9D1DE] dark:bg-white/25"}`}>
                <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${ligado ? "left-[21px]" : "left-[3px]"}`} />
            </span>
            {texto}
        </button>
    );
}
