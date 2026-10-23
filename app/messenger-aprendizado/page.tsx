"use client";

/**
 * Aprendizado da Aurora (22/10/2026) — rota /messenger-aprendizado
 * O Claude analisa o que aconteceu (toda noite pelo cron, ou no botão "Analisar agora") e propõe:
 * lições (regras curtas por habilidade), rascunhos de documento para a Base, exemplos de bons atendimentos e cenários de teste.
 * Nada entra na Aurora sem aprovação aqui. Acesso: página "Messenger · Configurações". Servidor: messenger.php (apr_*).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";

type Licao = { id: number; tipo: "licao" | "documento"; habilidade: string; titulo: string | null; texto: string; descricao: string | null; motivo: string | null; status: string; criado_em: string; decidido_em: string | null; por: string | null };
type Exemplo = { id: number; intencao: string; titulo: string; resumo: string; dialogo: string; motivo: string | null; status: string; criado_em: string };
type Cenario = { id: number; titulo: string; persona: string; regras: string; max_turnos: number; status: string; criado_em: string };
type Feedback = { id: number; util: number; motivo: string | null; criado_em: string; analisado: number; texto: string; por: string | null };
type Conflito = { tipo: "regra_fixa" | "base" | "licao" | "comando"; id: number; referencia: string; explicacao: string };
type Conferencia = { conflitos: Conflito[]; observacao: string; salvo?: boolean };
type Dados = { instalado: boolean; claude?: boolean; ultima_analise?: string | null; licoes?: Licao[]; exemplos?: Exemplo[]; cenarios?: Cenario[]; feedback?: Feedback[] };

const HABILIDADES: Record<string, string> = { geral: "Geral", falecimento: "Falecimento", velorio: "Velório", coroa: "Coroa", vendas: "Vendas", cobranca: "Cobrança", duvidas: "Dúvidas", reclamacao: "Reclamação" };
// Comandos da Gestão (23/10/2026): ficam na tabela de lições com este título
const COMANDO = "Comando da Gestão";
const TIPO_CONFLITO: Record<Conflito["tipo"], string> = { regra_fixa: "Regra fixa da Aurora", base: "Base de Conhecimento", licao: "Lição aprovada", comando: "Outro comando" };
const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const rotulo = "text-[12.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const btn = "h-10 rounded-xl px-3 text-[14px] font-extrabold disabled:opacity-50";
const dt = (s: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const selo = (s: string) => {
    const cor = ["aprovada", "aprovado", "ativo", "publicada"].includes(s) ? "bg-[#EEF5D6] text-[#2F4207]" : ["proposta", "proposto"].includes(s) ? "bg-[#FBF0C9] text-[#5C4600]" : "bg-[#F0F2F5] text-[#4A5468]";
    return <span className={`rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${cor}`}>{s}</span>;
};

function Copiar({ texto, rotuloBotao }: { texto: string; rotuloBotao: string }) {
    const [ok, setOk] = useState(false);
    return (
        <button type="button" className={`${btn} border border-[#C9D1DE] dark:border-white/25`} onClick={async () => { try { await navigator.clipboard.writeText(texto); } catch { /* sem permissão */ } setOk(true); setTimeout(() => setOk(false), 2000); }}>
            {ok ? "✓ Copiado" : rotuloBotao}
        </button>
    );
}

export default function AprendizadoAuroraPage() {
    const [d, setD] = useState<Dados | null>(null);
    const [aba, setAba] = useState<"comandos" | "licoes" | "base" | "exemplos" | "cenarios" | "equipe">("comandos");
    const [cmdTexto, setCmdTexto] = useState("");
    const [cmdHab, setCmdHab] = useState("geral");
    const [conf, setConf] = useState<Conferencia | null>(null);
    const [desativar, setDesativar] = useState<number[]>([]);
    const [conferindo, setConferindo] = useState(false);
    const [msg, setMsg] = useState("");
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [edicao, setEdicao] = useState<Record<string, string>>({});
    const carregar = useCallback(async () => {
        try {
            setD(await msgGet<Dados>("apr_listar", {}, false));
        } catch (e: any) {
            setErro(e.message);
        }
    }, []);
    useEffect(() => {
        carregar();
    }, [carregar]);
    const decidir = async (tipo: "licao" | "exemplo" | "cenario", id: number, decisao: string, extra: Record<string, string> = {}) => {
        setErro("");
        try {
            const texto = edicao[`${tipo}${id}`];
            await msgPost("apr_decidir", { tipo, id, decisao, ...(texto !== undefined ? { texto } : {}), ...extra });
            await carregar();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const analisar = async () => {
        setOcupado(true);
        setErro("");
        setMsg("");
        try {
            const r = await msgPost("apr_analisar", {});
            setMsg(r.msg);
            await carregar();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(false);
        }
    };
    const conferirComando = async (salvar: boolean) => {
        setErro("");
        setMsg("");
        setConferindo(true);
        try {
            const r = await msgPost(salvar ? "apr_comando_salvar" : "apr_comando_conferir", { texto: cmdTexto, habilidade: cmdHab, desativar });
            const c: Conferencia = r?.dados || { conflitos: [], observacao: "" };
            if (salvar && c.salvo) {
                setMsg(r.msg || "Comando salvo.");
                setCmdTexto("");
                setConf(null);
                setDesativar([]);
                await carregar();
            } else {
                setConf(c);
                setDesativar((x) => x.filter((id) => c.conflitos.some((k) => k.id === id)));
            }
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setConferindo(false);
        }
    };
    if (d && !d.instalado) {
        return <div className="p-6"><div className={cartao}><b>O aprendizado da Aurora ainda não foi instalado.</b><p className="mt-1 text-[14.5px]">Rode no banco o SQL das tabelas chat_ia_licoes, chat_ia_exemplos, chat_ia_feedback e chat_ia_cenarios.</p></div></div>;
    }
    const licoes = (d?.licoes || []).filter((l) => l.tipo === "licao" && l.titulo !== COMANDO);
    const comandos = (d?.licoes || []).filter((l) => l.tipo === "licao" && l.titulo === COMANDO && l.status !== "rejeitada");
    const bloqueado = !!conf && conf.conflitos.some((c) => c.tipo === "regra_fixa" || c.tipo === "base" || !c.id);
    const faltaDesativar = !!conf && conf.conflitos.some((c) => (c.tipo === "licao" || c.tipo === "comando") && c.id > 0 && !desativar.includes(c.id));
    const docs = (d?.licoes || []).filter((l) => l.tipo === "documento");
    const pend: Record<string, number> = {
        comandos: 0,
        licoes: licoes.filter((l) => l.status === "proposta").length,
        base: docs.filter((l) => l.status === "proposta").length,
        exemplos: (d?.exemplos || []).filter((e) => e.status === "proposto").length,
        cenarios: (d?.cenarios || []).filter((c) => c.status === "proposto").length,
        equipe: (d?.feedback || []).filter((f) => !f.util && !f.analisado).length,
    };
    const campoEdicao = (chave: string, inicial: string, linhas = 3) => (
        <textarea className="mt-2 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] p-3 text-[14.5px] dark:border-white/15 dark:bg-[#1C2334]" rows={linhas} value={edicao[chave] ?? inicial} onChange={(e) => setEdicao((x) => ({ ...x, [chave]: e.target.value }))} />
    );
    return (
        <div className="w-full min-w-0 max-w-full overflow-x-hidden p-4 text-[#313C55] [contain:inline-size] md:p-6 dark:text-white">
            <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[30px]">🧠 Aprendizado da Aurora</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Toda noite o Claude analisa os testes, os atendimentos reais, as notas dos clientes, as avaliações da equipe (👍/👎) e as perguntas sem resposta, e propõe melhorias. Nada muda na Aurora sem aprovação aqui. As regras principais (respeito, documentos, valores do sistema, falecimento com uma pessoa) não mudam.</p>
                    </div>
                    <div className="text-right text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Última análise: {dt(d?.ultima_analise || null)}<br />
                        <button type="button" disabled={ocupado || !d?.claude} onClick={analisar} className={`${btn} mt-1 bg-[#313C55] text-white`}>{ocupado ? "Analisando… (até 2 min)" : "Analisar agora"}</button></div>
                </div>
                {!d?.claude && d && <p className="rounded-xl border border-[#C9A21E] bg-[#FBF0C9] px-4 py-2 text-[14px] font-bold text-[#5C4600]">Falta a chave do Claude (anthropic_api_key) no pai-chaves.php.</p>}
                {msg && <p className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-[14px] font-bold text-[#2F4207]">{msg}</p>}
                {erro && <p className="rounded-xl bg-[#FDECEA] px-4 py-2 text-[14px] font-bold text-[#B42318]">{erro}</p>}
                <div className="flex flex-wrap gap-2">
                    {([["comandos", "Comandos da Gestão"], ["licoes", "Lições"], ["base", "Para a Base"], ["exemplos", "Exemplos"], ["cenarios", "Cenários de teste"], ["equipe", "Avaliações da equipe"]] as const).map(([k, n]) => (
                        <button key={k} type="button" onClick={() => setAba(k)} aria-pressed={aba === k} className={`h-10 rounded-full px-4 text-[14.5px] ${aba === k ? "bg-[#E3EFC0] font-extrabold text-[#2F4207]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>{n}{pend[k] ? <span className="ml-1.5 rounded-full bg-[#C9A21E] px-1.5 text-[12px] text-white">{pend[k]}</span> : null}</button>
                    ))}
                </div>
                {!d && <p>Carregando…</p>}

                {d && aba === "comandos" && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Instruções escritas pela Gestão. Antes de salvar, o Claude confere se o comando contraria as regras fixas da Aurora, a Base de Conhecimento, as lições aprovadas ou outros comandos. Salvo, vale na hora e pesa mais que as lições automáticas. Os comandos e as lições aprovadas valem para a Aurora do WhatsApp e para a Aurora do /chat.</p>
                        <div className={cartao}>
                            <div className={rotulo}>Novo comando</div>
                            <textarea className="mt-2 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] p-3 text-[15px] dark:border-white/15 dark:bg-[#1C2334]" rows={3} maxLength={600} placeholder="Ex.: Ao falar de coroa, ofereça primeiro o site e só depois os modelos por aqui." value={cmdTexto} onChange={(e) => { setCmdTexto(e.target.value); setConf(null); }} />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <select aria-label="Assunto" className="h-10 rounded-xl border border-[#E1E5EC] bg-white px-2 text-[14px] dark:border-white/15 dark:bg-[#1C2334]" value={cmdHab} onChange={(e) => { setCmdHab(e.target.value); setConf(null); }}>{Object.entries(HABILIDADES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                                <button type="button" disabled={conferindo || cmdTexto.trim().length < 8 || !d.claude} onClick={() => conferirComando(false)} className={`${btn} border border-[#C9D1DE] dark:border-white/25`}>{conferindo && !conf ? "Conferindo…" : "Conferir conflitos"}</button>
                                {conf && !bloqueado && (
                                    <button type="button" disabled={conferindo || faltaDesativar} onClick={() => conferirComando(true)} className={`${btn} bg-[#4C9A2A] text-white`}>{conferindo ? "Salvando…" : "Salvar comando"}</button>
                                )}
                            </div>
                            {conf && !conf.conflitos.length && <p className="mt-3 rounded-xl bg-[#EEF5D6] px-3 py-2 text-[14px] font-bold text-[#2F4207]">✓ Nenhum conflito encontrado. Pode salvar.</p>}
                            {conf && conf.conflitos.length > 0 && (
                                <div className="mt-3 flex flex-col gap-2">
                                    <div className={rotulo}>Conflitos encontrados</div>
                                    {conf.conflitos.map((c, i) => (
                                        <div key={i} className="rounded-xl bg-[#FDECEA] p-3 text-[14px] text-[#5A1A12] dark:bg-[#FF9C92]/15 dark:text-[#FFD6D1]">
                                            <b>{TIPO_CONFLITO[c.tipo]}</b>{c.referencia ? `: ${c.referencia}` : ""}
                                            <span className="mt-1 block">{c.explicacao}</span>
                                            {(c.tipo === "licao" || c.tipo === "comando") && c.id > 0 && (
                                                <label className="mt-2 flex items-center gap-2 font-bold">
                                                    <input type="checkbox" className="h-5 w-5" checked={desativar.includes(c.id)} onChange={(e) => setDesativar((x) => (e.target.checked ? [...x, c.id] : x.filter((v) => v !== c.id)))} />
                                                    Desativar este item ao salvar o comando
                                                </label>
                                            )}
                                        </div>
                                    ))}
                                    {bloqueado && <p className="text-[13.5px] font-bold text-[#B42318]">Conflito com regra fixa ou com a Base não pode ser salvo: ajuste o texto do comando (ou, se for o caso, corrija a Base de Conhecimento antes).</p>}
                                    {!bloqueado && faltaDesativar && <p className="text-[13.5px] font-bold text-[#5C4600] dark:text-[#F5E3A3]">Para salvar, marque para desativar os itens em conflito ou ajuste o texto.</p>}
                                </div>
                            )}
                            {conf?.observacao && <p className="mt-2 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">💡 {conf.observacao}</p>}
                        </div>
                        {!comandos.length && <p className={cartao}>Nenhum comando ainda.</p>}
                        {comandos.map((l) => (
                            <div key={l.id} className={cartao}>
                                <div className="flex flex-wrap items-center gap-2"><span className={rotulo}>{HABILIDADES[l.habilidade] || l.habilidade}</span>{selo(l.status)}<span className="flex-1" /><span className="text-[12px] text-[#6B7488]">{dt(l.decidido_em || l.criado_em)}{l.por ? ` · ${l.por}` : ""}</span></div>
                                <p className="mt-2 text-[15px] font-bold">{l.texto}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {l.status === "aprovada" && <button type="button" className={`${btn} border border-[#C9D1DE] dark:border-white/25`} onClick={() => decidir("licao", l.id, "desativada")}>Desativar</button>}
                                    {l.status === "desativada" && <button type="button" className={`${btn} border border-[#C9D1DE] dark:border-white/25`} onClick={() => { setCmdTexto(l.texto); setCmdHab(l.habilidade); setConf(null); }}>Usar de novo (confere conflitos)</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {d && aba === "licoes" && (
                    <div className="flex flex-col gap-3">
                        {!licoes.length && <p className={cartao}>Nenhuma lição ainda. Rode os testes e clique em "Analisar agora", ou espere a análise da noite.</p>}
                        {licoes.map((l) => (
                            <div key={l.id} className={cartao}>
                                <div className="flex flex-wrap items-center gap-2"><span className={rotulo}>{HABILIDADES[l.habilidade] || l.habilidade}</span>{selo(l.status)}<span className="flex-1" /><span className="text-[12px] text-[#6B7488]">{dt(l.criado_em)}{l.por ? ` · ${l.status} por ${l.por}` : ""}</span></div>
                                {l.status === "proposta" ? campoEdicao(`licao${l.id}`, l.texto, 2) : <p className="mt-2 text-[15px] font-bold">{l.texto}</p>}
                                {l.motivo && <p className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Por quê: {l.motivo}</p>}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {l.status === "proposta" && (
                                        <>
                                            <select aria-label="Habilidade" className="h-10 rounded-xl border border-[#E1E5EC] bg-white px-2 text-[14px] dark:border-white/15 dark:bg-[#1C2334]" value={edicao[`hab${l.id}`] ?? l.habilidade} onChange={(e) => setEdicao((x) => ({ ...x, [`hab${l.id}`]: e.target.value }))}>{Object.entries(HABILIDADES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                                            <button type="button" className={`${btn} bg-[#4C9A2A] text-white`} onClick={() => decidir("licao", l.id, "aprovada", { habilidade: edicao[`hab${l.id}`] ?? l.habilidade })}>Aprovar</button>
                                            <button type="button" className={`${btn} border border-[#C9D1DE] text-[#B42318] dark:border-white/25`} onClick={() => decidir("licao", l.id, "rejeitada")}>Rejeitar</button>
                                        </>
                                    )}
                                    {l.status === "aprovada" && <button type="button" className={`${btn} border border-[#C9D1DE] dark:border-white/25`} onClick={() => decidir("licao", l.id, "desativada")}>Desativar</button>}
                                    {l.status === "desativada" && <button type="button" className={`${btn} border border-[#C9D1DE] dark:border-white/25`} onClick={() => decidir("licao", l.id, "aprovada")}>Reativar</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {d && aba === "base" && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Rascunhos escritos a partir das perguntas que a Aurora não soube responder. Complete os trechos <b>[PREENCHER]</b>, copie para a Base de Conhecimento (departamento ATENDIMENTO AO CLIENTE) e marque como publicado.</p>
                        {!docs.length && <p className={cartao}>Nenhum rascunho. Eles aparecem quando os clientes fazem perguntas que a Base não responde.</p>}
                        {docs.map((l) => (
                            <div key={l.id} className={cartao}>
                                <div className="flex flex-wrap items-center gap-2"><b className="min-w-0 flex-1 text-[16px]">{l.titulo}</b>{selo(l.status)}</div>
                                {l.descricao && <p className="mt-1 text-[14px] text-[#4A5468] dark:text-[#C9D1DE]">{l.descricao}</p>}
                                {l.status === "proposta" ? campoEdicao(`licao${l.id}`, l.texto, 8) : <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[14px]">{l.texto}</pre>}
                                {l.status === "proposta" && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Copiar texto={l.titulo || ""} rotuloBotao="Copiar título" />
                                        <Copiar texto={l.descricao || ""} rotuloBotao="Copiar descrição" />
                                        <Copiar texto={edicao[`licao${l.id}`] ?? l.texto} rotuloBotao="Copiar conteúdo" />
                                        <button type="button" className={`${btn} bg-[#4C9A2A] text-white`} onClick={() => decidir("licao", l.id, "publicada")}>Publicado na Base</button>
                                        <button type="button" className={`${btn} border border-[#C9D1DE] text-[#B42318] dark:border-white/25`} onClick={() => decidir("licao", l.id, "rejeitada")}>Descartar</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {d && aba === "exemplos" && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Atendimentos bem avaliados, sem dados pessoais. Aprovados, a Aurora recebe 1 ou 2 parecidos com a conversa do momento para se inspirar.</p>
                        {!(d.exemplos || []).length && <p className={cartao}>Nenhum exemplo ainda. Eles vêm dos atendimentos com nota 5 do cliente.</p>}
                        {(d.exemplos || []).map((e) => (
                            <div key={e.id} className={cartao}>
                                <div className="flex flex-wrap items-center gap-2"><b className="min-w-0 flex-1 text-[16px]">{e.titulo}</b><span className={rotulo}>{e.intencao}</span>{selo(e.status)}</div>
                                <p className="mt-1 text-[14px]">{e.resumo}</p>
                                {e.status === "proposto" ? campoEdicao(`exemplo${e.id}`, e.dialogo, 6) : <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[14px]">{e.dialogo}</pre>}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {e.status === "proposto" && <button type="button" className={`${btn} bg-[#4C9A2A] text-white`} onClick={() => decidir("exemplo", e.id, "aprovado")}>Aprovar</button>}
                                    <button type="button" className={`${btn} border border-[#C9D1DE] text-[#B42318] dark:border-white/25`} onClick={() => decidir("exemplo", e.id, "rejeitado")}>{e.status === "proposto" ? "Rejeitar" : "Remover"}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {d && aba === "cenarios" && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Situações reais em que a Aurora falhou, transformadas em teste (sem dados pessoais). Ativos, aparecem em Testes da Aurora com o símbolo 🔁, junto dos 8 fixos.</p>
                        {!(d.cenarios || []).length && <p className={cartao}>Nenhum cenário novo.</p>}
                        {(d.cenarios || []).map((c) => (
                            <div key={c.id} className={cartao}>
                                <div className="flex flex-wrap items-center gap-2"><b className="min-w-0 flex-1 text-[16px]">{c.titulo}</b>{selo(c.status)}</div>
                                <p className="mt-1 text-[14px]"><b>Cliente:</b> {c.persona}</p>
                                {c.status === "proposto" ? campoEdicao(`cenario${c.id}`, c.regras, 3) : <p className="mt-1 text-[14px]"><b>A Aurora deve:</b> {c.regras}</p>}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {c.status === "proposto" && <button type="button" className={`${btn} bg-[#4C9A2A] text-white`} onClick={() => decidir("cenario", c.id, "ativo")}>Ativar</button>}
                                    <button type="button" className={`${btn} border border-[#C9D1DE] text-[#B42318] dark:border-white/25`} onClick={() => decidir("cenario", c.id, "inativo")}>{c.status === "proposto" ? "Descartar" : "Desativar"}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {d && aba === "equipe" && (
                    <div className={cartao}>
                        <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">O que a equipe marcou nas mensagens da Aurora (👍/👎 no balão "Mensagem automática"). Os 👎 entram na próxima análise.</p>
                        {!(d.feedback || []).length && <p className="mt-2">Nenhuma avaliação ainda.</p>}
                        {(d.feedback || []).map((f) => (
                            <div key={f.id} className="border-t border-[#EEF0F3] py-2.5 text-[14.5px] first:border-0 dark:border-white/10">
                                <div className="flex flex-wrap items-center gap-2"><span>{f.util ? "👍" : "👎"}</span><b>{f.por || "—"}</b><span className="text-[12px] text-[#6B7488]">{dt(f.criado_em)}{f.analisado ? " · analisado" : ""}</span></div>
                                <p className="mt-0.5 break-words italic text-[#4A5468] dark:text-[#C9D1DE]">“{f.texto}”</p>
                                {f.motivo && <p className="mt-0.5">→ {f.motivo}</p>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
