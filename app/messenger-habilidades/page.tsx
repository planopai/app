"use client";

/**
 * Habilidades da Aurora por setor (27/10/2026) — rota /messenger-habilidades
 * Para cada setor do Messenger: instruções de atendimento, dados que a Aurora pede antes de passar, se ela pode resolver
 * sozinha (encerrar quando respondeu pela Base) e os departamentos da Base de Conhecimento usados ali.
 * Setor sem habilidade cadastrada segue como antes. Servidor: aurora_07.php (habilidades, habilidade_salvar);
 * a Aurora usa pelo aurora_06.php. Acesso: Configurações do Messenger (messenger-config) ou Gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_07.php`;

type Habilidade = { instrucoes: string; coletar: string[]; resolver: boolean; kb: number[]; atualizado_em: string; atualizado_por: string };
type Setor = { id: number; nome: string; cor: string; ativo: boolean; descricao_ia: string | null; habilidade: Habilidade | null };
type Departamento = { id: number; nome: string; ativo: boolean; docs: number; geral: boolean };
type Dados = { setores: Setor[]; departamentos: Departamento[]; ia_ativa: boolean };
type Form = { instrucoes: string; coletar: string; resolver: boolean; kb: number[] };

const BTN = "inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-extrabold leading-none disabled:opacity-50";
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "w-full rounded-xl border-0 bg-[#F1F4F8] px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const ROTULO = "mb-1 block text-[14px] font-extrabold";
const AJUDA = "mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]";
const dt = (s: string) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const formDe = (h: Habilidade | null): Form => ({ instrucoes: h?.instrucoes || "", coletar: (h?.coletar || []).join("\n"), resolver: h ? h.resolver : false, kb: h?.kb || [] });

export default function HabilidadesPage() {
    const [dados, setDados] = useState<Dados | null>(null);
    const [selId, setSelId] = useState<number | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [mudou, setMudou] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");

    const carregar = useCallback(async () => {
        try {
            const j = await apiJson(`${API}?action=habilidades&_=${Date.now()}`);
            setDados(j.dados as Dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar.");
        }
    }, []);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const sel = dados?.setores.find((s) => s.id === selId) || null;

    function escolher(s: Setor) {
        if (mudou && !window.confirm("Há alterações não salvas neste setor. Descartar?")) return;
        setSelId(s.id);
        setForm(formDe(s.habilidade));
        setMudou(false);
        setErro("");
        setAviso("");
    }

    function mudar(f: Form) {
        setForm(f);
        setMudou(true);
    }

    async function salvar() {
        if (!sel || !form) return;
        setSalvando(true);
        setErro("");
        setAviso("");
        try {
            const j = await apiJson(`${API}?action=habilidade_salvar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ setor_id: sel.id, instrucoes: form.instrucoes, coletar: form.coletar.split("\n").map((x) => x.trim()).filter(Boolean), resolver: form.resolver, kb: form.kb }),
            });
            setAviso(j.msg || "Salvo.");
            setMudou(false);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Habilidades da Aurora</h1>
                    <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Como a Aurora atende em cada setor: orientações, dados que ela pede antes de passar, se pode resolver sozinha e a parte da Base de Conhecimento que usa ali. Setor sem habilidade segue as regras gerais.</p>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207]">{aviso}</div>}
                {dados && !dados.ia_ativa && <div className="rounded-xl border border-[#F2CB3F] bg-[#FBF0C9] px-4 py-2 text-sm font-bold text-[#5C4600]">A Aurora no atendimento está desligada (Configurações do Messenger › Aurora). As habilidades valem quando ela estiver ligada.</div>}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                    <section className={`${CARTAO} flex flex-col gap-1 p-2 ${sel ? "hidden lg:flex" : ""}`}>
                        {!dados && !erro && <p className="p-3">Carregando…</p>}
                        {dados && !dados.setores.length && <p className="p-3">Nenhum setor cadastrado (Configurações do Messenger › Setores).</p>}
                        {(dados?.setores || []).map((s) => (
                            <button key={s.id} type="button" onClick={() => escolher(s)}
                                className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/5 ${selId === s.id ? "bg-[#F0F2F5] dark:bg-white/10" : ""} ${s.ativo ? "" : "opacity-60"}`}>
                                <span className="flex items-center gap-2">
                                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: s.cor }} aria-hidden="true" />
                                    <b className="min-w-0 flex-1 truncate text-[15.5px]">{s.nome}</b>
                                    {!s.ativo && <span className="text-[12px] font-bold">inativo</span>}
                                </span>
                                <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    {s.habilidade
                                        ? `${s.habilidade.resolver ? "Resolve sozinha" : "Sempre passa"}${s.habilidade.coletar.length ? ` · coleta ${s.habilidade.coletar.length} dado(s)` : ""}${s.habilidade.kb.length ? ` · ${s.habilidade.kb.length} depto(s) da Base` : ""}`
                                        : "Sem habilidade (regras gerais)"}
                                </span>
                            </button>
                        ))}
                    </section>

                    <section className={`${CARTAO} ${sel ? "" : "hidden lg:block"}`}>
                        {!sel && <p className="m-0 text-[#6B7488]">Escolha um setor para configurar.</p>}
                        {sel && form && (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-2">
                                    <button type="button" className={`${BTN} border border-[#C9D1DE] lg:hidden`} onClick={() => { if (!mudou || window.confirm("Descartar as alterações?")) { setSelId(null); setMudou(false); } }} aria-label="Voltar">←</button>
                                    <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: sel.cor }} aria-hidden="true" />
                                    <h2 className="m-0 min-w-0 flex-1 truncate text-[20px] font-extrabold">{sel.nome}</h2>
                                </div>
                                {sel.descricao_ia && <p className="m-0 rounded-xl bg-[#F4F6F9] p-3 text-[14px] dark:bg-[#1C2334]"><b>Descrição para a triagem:</b> {sel.descricao_ia}</p>}

                                <label className="block">
                                    <span className={ROTULO}>Instruções do setor</span>
                                    <textarea className={`${CAMPO} h-44`} value={form.instrucoes} maxLength={4000} onChange={(e) => mudar({ ...form, instrucoes: e.target.value })}
                                        placeholder={"Ex.: Financeiro — confirme o contrato antes de falar de valores; não negocie desconto (passe ao atendente); se a pessoa só quiser a segunda via, ofereça o link de pagamento."} />
                                    <span className={AJUDA}>Tom, o que a Aurora pode e não pode responder neste setor e regras próprias. As regras gerais (emergência, falecimento, respeito) continuam valendo. {form.instrucoes.length}/4000</span>
                                </label>

                                <label className="block">
                                    <span className={ROTULO}>Dados a coletar antes de passar (um por linha)</span>
                                    <textarea className={`${CAMPO} h-28`} value={form.coletar} onChange={(e) => mudar({ ...form, coletar: e.target.value })} placeholder={"Número do contrato\nNome do titular\nMotivo do contato"} />
                                    <span className={AJUDA}>A Aurora pede um de cada vez. Se a pessoa não souber, pedir um atendente ou for um falecimento, ela passa na hora.</span>
                                </label>

                                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#F4F6F9] p-3 dark:bg-[#1C2334]">
                                    <input type="checkbox" className="mt-1 size-5 shrink-0" checked={form.resolver} onChange={(e) => mudar({ ...form, resolver: e.target.checked })} />
                                    <span>
                                        <b className="block text-[15px]">Pode resolver sozinha</b>
                                        <span className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Ligado: quando a Base responde e a pessoa se despede satisfeita, a Aurora encerra o atendimento sem passar a ninguém. Desligado: depois de responder, ela sempre passa para um atendente deste setor. Reclamação, cancelamento e pedido de atendente sempre passam.</span>
                                    </span>
                                </label>

                                <div>
                                    <span className={ROTULO}>Base de Conhecimento deste setor</span>
                                    <span className={AJUDA}>Departamentos que a Aurora consulta quando a conversa está neste setor, além dos liberados para todos em Configurações › Aurora.</span>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {(dados?.departamentos || []).filter((d) => d.ativo).map((d) => (
                                            <label key={d.id} className={`flex items-center gap-2 rounded-xl border border-[#E1E5EC] px-3 py-2 text-[14px] dark:border-white/12 ${d.geral ? "opacity-70" : "cursor-pointer"}`}>
                                                <input type="checkbox" className="size-5 shrink-0" disabled={d.geral} checked={d.geral || form.kb.includes(d.id)}
                                                    onChange={(e) => mudar({ ...form, kb: e.target.checked ? [...form.kb, d.id] : form.kb.filter((x) => x !== d.id) })} />
                                                <span className="min-w-0 flex-1"><b>{d.nome}</b> <span className="text-[12.5px] text-[#6B7488]">· {d.docs} doc(s){d.geral ? " · já liberado para todos" : ""}</span></span>
                                            </label>
                                        ))}
                                        {!(dados?.departamentos || []).length && <p className="m-0 text-[14px]">Nenhum departamento na Base.</p>}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button type="button" className={BTN_PRI} disabled={salvando || !mudou} onClick={salvar}>{salvando ? "Salvando…" : "Salvar habilidade"}</button>
                                    {sel.habilidade?.atualizado_em && <span className="text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">Alterada por {sel.habilidade.atualizado_por || "—"} em {dt(sel.habilidade.atualizado_em)}</span>}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
