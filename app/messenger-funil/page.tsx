"use client";

/**
 * Funil de vendas (27/10/2026) — rota /messenger-funil
 * Leads do WhatsApp em etapas: Novo → Em conversa → Proposta enviada → Ficha preenchida → Fechado / Perdido.
 *  - A Aurora acompanhante cria e atualiza os cards depois que o atendimento é encerrado (quem pediu plano e não é associado)
 *    e só move entre Novo e Em conversa (ou Perdido, quando a pessoa recusou claramente).
 *  - Proposta, Ficha e Fechado/Perdido vêm sozinhos das Propostas de adesão.
 *  - A equipe arrasta os cards (no computador) ou usa "Mover para", define responsável, próximo contato e anotações.
 * Servidor: aurora_04.php (arquivo novo). Acesso: página "messenger".
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_04.php`;

type Etapa = "novo" | "em_conversa" | "proposta" | "ficha" | "fechado" | "perdido";
type Card = {
    id: number; contato_id: number | null; conversa_id: number | null; nome: string | null; telefone: string | null; cidade: string | null;
    plano: string | null; pessoas: number | null; interesse: string | null; origem: string | null; etapa: Etapa; motivo_perda: string | null;
    proximo_passo: string | null; proximo_contato: string | null; valor_mensal: number | null; proposta_id: number | null; contrato: string | null;
    responsavel_id: number | null; responsavel: string | null; notas: string | null; criado_em: string | null; atualizado_em: string | null;
    etapa_em: string | null; fechado_em: string | null;
};
type Pessoa = { id: number; nome: string };
type Painel = {
    cards: Card[]; etapas: Record<Etapa, string>; equipe: Pessoa[]; mes: { fechados: number; perdidos: number; valor: number };
    aurora: { ativo: boolean; ultima: string | null }; gestao: boolean;
};
type Hist = { de: string | null; para: string | null; texto: string | null; quem: string; em: string | null };
type Form = {
    id: number; nome: string; telefone: string; cidade: string; plano: string; pessoas: string; interesse: string; origem: string;
    proximo_passo: string; proximo_contato: string; responsavel_id: string; valor_mensal: string; notas: string;
};

const ORDEM: Etapa[] = ["novo", "em_conversa", "proposta", "ficha", "fechado", "perdido"];
const COR: Record<Etapa, string> = {
    novo: "border-t-[#3D6A99]", em_conversa: "border-t-[#7A5AF8]", proposta: "border-t-[#F2CB3F]",
    ficha: "border-t-[#E8833A]", fechado: "border-t-[#4C9A2A]", perdido: "border-t-[#98A2B3]",
};
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dataBr = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const fone = (t: string | null) => {
    const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : t || "";
};
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dias = (s: string | null) => (s ? Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000)) : 0);

async function aGet<T = any>(acao: string, params: Record<string, any> = {}): Promise<T> {
    const u = new URL(API);
    u.searchParams.set("action", acao);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    const j = await apiJson(u.toString());
    return j.dados as T;
}
async function aPost(acao: string, corpo: Record<string, any> = {}) {
    return apiJson(`${API}?action=${encodeURIComponent(acao)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
}

const BTN = "inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-extrabold leading-none disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[#C9D1DE] bg-white dark:border-white/15 dark:bg-transparent`;
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const ROTULO = "mb-1 block text-[13.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]";

const vazio = (): Form => ({ id: 0, nome: "", telefone: "", cidade: "", plano: "", pessoas: "", interesse: "", origem: "", proximo_passo: "", proximo_contato: "", responsavel_id: "", valor_mensal: "", notas: "" });
const doCard = (c: Card): Form => ({
    id: c.id, nome: c.nome || "", telefone: fone(c.telefone), cidade: c.cidade || "", plano: c.plano || "", pessoas: c.pessoas ? String(c.pessoas) : "",
    interesse: c.interesse || "", origem: c.origem || "", proximo_passo: c.proximo_passo || "", proximo_contato: c.proximo_contato || "",
    responsavel_id: c.responsavel_id ? String(c.responsavel_id) : "", valor_mensal: c.valor_mensal !== null ? String(c.valor_mensal) : "", notas: c.notas || "",
});

export default function FunilPage() {
    const [painel, setPainel] = useState<Painel | null>(null);
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [resp, setResp] = useState("");
    const [aberto, setAberto] = useState<Card | null>(null);
    const [hist, setHist] = useState<Hist[]>([]);
    const [form, setForm] = useState<Form | null>(null);
    const [mover, setMover] = useState<{ etapa: Etapa; motivo: string; contrato: string } | null>(null);
    const [arrastando, setArrastando] = useState<number | null>(null);
    const [sobre, setSobre] = useState<Etapa | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [aba, setAba] = useState<Etapa>("novo");

    const carregar = useCallback(async () => {
        try {
            setPainel(await aGet<Painel>("funil", { q: buscaAplicada, responsavel: resp }));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o funil.");
        }
    }, [buscaAplicada, resp]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    // janela do card: Esc fecha e a página de trás não rola
    useEffect(() => {
        if (!form) return;
        const tecla = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") fechar();
        };
        const antes = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", tecla);
        return () => {
            window.removeEventListener("keydown", tecla);
            document.body.style.overflow = antes;
        };
    }, [form ? form.id : -1]); // eslint-disable-line react-hooks/exhaustive-deps

    async function abrir(c: Card) {
        setAberto(c);
        setForm(doCard(c));
        setMover(null);
        setHist([]);
        setErro("");
        setAviso("");
        try {
            const d = await aGet<{ card: Card; historico: Hist[] }>("card", { id: c.id });
            setAberto(d.card);
            setForm(doCard(d.card));
            setHist(d.historico);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir o card.");
        }
    }

    function fechar() {
        setAberto(null);
        setForm(null);
        setMover(null);
    }

    async function salvar() {
        if (!form) return;
        setOcupado(true);
        setErro("");
        try {
            const j = await aPost("card_salvar", { ...form, telefone: form.telefone.replace(/\D/g, ""), valor_mensal: form.valor_mensal.replace(",", ".") });
            setAviso(j?.msg || "Salvo.");
            await carregar();
            if (form.id === 0) {
                fechar();
            } else if (aberto) {
                await abrir({ ...aberto });
            }
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setOcupado(false);
        }
    }

    async function moverPara(c: Card, etapa: Etapa, motivo = "", contrato = "") {
        if (etapa === c.etapa) return;
        if (etapa === "perdido" && !motivo) {
            abrir(c);
            setMover({ etapa, motivo: "", contrato: "" });
            return;
        }
        setOcupado(true);
        setErro("");
        try {
            const j = await aPost("card_mover", { id: c.id, etapa, motivo_perda: motivo, contrato });
            setAviso(j?.msg || "Movido.");
            setMover(null);
            await carregar();
            if (aberto && aberto.id === c.id) await abrir({ ...c, etapa });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível mover.");
        } finally {
            setOcupado(false);
        }
    }

    const cards = painel?.cards || [];
    const porEtapa = (e: Etapa) => cards.filter((c) => c.etapa === e);
    const etapas = painel?.etapas || ({} as Record<Etapa, string>);

    function cardMini(c: Card) {
        const atrasado = !!c.proximo_contato && c.proximo_contato <= hoje() && c.etapa !== "fechado" && c.etapa !== "perdido";
        return (
            <button key={c.id} type="button" draggable onDragStart={() => setArrastando(c.id)} onDragEnd={() => { setArrastando(null); setSobre(null); }}
                onClick={() => abrir(c)}
                className={`flex w-full flex-col gap-1 rounded-xl border border-[#E1E5EC] bg-white p-3 text-left shadow-sm hover:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] ${arrastando === c.id ? "opacity-50" : ""} ${aberto?.id === c.id ? "ring-2 ring-[#3D6A99]" : ""}`}>
                <span className="flex items-start gap-2">
                    <b className="min-w-0 flex-1 truncate text-[15px]">{c.nome || fone(c.telefone) || "Sem nome"}</b>
                    {c.plano && <span className="shrink-0 rounded-lg bg-[#313C55] px-2 py-0.5 text-[12px] font-extrabold text-white">{c.plano}</span>}
                </span>
                {c.interesse && <span className="line-clamp-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{c.interesse}</span>}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">
                    {c.valor_mensal ? <b className="text-[#2F6B12] dark:text-[#D5E79A]">{brl(c.valor_mensal)}/mês</b> : null}
                    {c.cidade && <span>{c.cidade}</span>}
                    <span>{c.responsavel || "sem responsável"}</span>
                    <span>· há {dias(c.etapa_em)} d</span>
                </span>
                {c.proximo_contato && c.etapa !== "fechado" && c.etapa !== "perdido" && (
                    <span className={`w-fit rounded-lg px-2 py-0.5 text-[12px] font-bold ${atrasado ? "bg-[#FDECEA] text-[#B42318]" : "bg-[#E9EFF6] text-[#1E3A5C]"}`}>
                        Contato {dataBr(c.proximo_contato)}
                    </span>
                )}
                {c.etapa === "perdido" && c.motivo_perda && <span className="line-clamp-1 text-[12.5px] text-[#6B7488]">Motivo: {c.motivo_perda}</span>}
                {c.contrato && <span className="text-[12.5px] font-bold">Contrato {c.contrato}</span>}
            </button>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Funil de vendas</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Leads do WhatsApp até o contrato. A Aurora cria os cards depois de cada atendimento; Proposta, Ficha e Fechado vêm das Propostas de adesão.
                            {painel && !painel.aurora.ativo && " (Aurora acompanhante desligada: os cards novos só entram pelas propostas ou à mão.)"}
                        </p>
                    </div>
                    <button type="button" className={BTN_PRI} onClick={() => { setAberto(null); setHist([]); setMover(null); setForm(vazio()); }}>Novo lead</button>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207]">{aviso}</div>}

                {painel && (
                    <div className="flex flex-wrap gap-2">
                        {[["Em andamento", String(cards.filter((c) => c.etapa !== "fechado" && c.etapa !== "perdido").length)], ["Fechados no mês", String(painel.mes.fechados)],
                          ["Mensalidades fechadas no mês", brl(painel.mes.valor)], ["Perdidos no mês", String(painel.mes.perdidos)]].map(([r, v]) => (
                            <div key={r} className="min-w-[150px] flex-1 rounded-2xl bg-white px-4 py-3 dark:bg-[#232B3F]">
                                <b className="block text-[20px]">{v}</b>
                                <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{r}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col gap-2 md:flex-row">
                    <form className="flex flex-1 gap-2" onSubmit={(ev) => { ev.preventDefault(); setBuscaAplicada(busca.trim()); }}>
                        <input className={CAMPO} value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Nome, telefone, cidade ou contrato" />
                        <button type="submit" className={BTN_PRI}>Buscar</button>
                    </form>
                    <select className={`${CAMPO} md:w-[260px]`} value={resp} onChange={(ev) => setResp(ev.target.value)} aria-label="Responsável">
                        <option value="">Todos os responsáveis</option>
                        <option value="sem">Sem responsável</option>
                        {(painel?.equipe || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                </div>

                {/* celular: uma etapa por vez */}
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                    {ORDEM.map((e) => (
                        <button key={e} type="button" aria-pressed={aba === e} onClick={() => setAba(e)}
                            className={`h-11 shrink-0 rounded-full px-4 text-[14.5px] ${aba === e ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>
                            {etapas[e] || e} · {porEtapa(e).length}
                        </button>
                    ))}
                </div>

                <div>
                    <div className="min-w-0">
                        {!painel && !erro && <p className={CARTAO}>Carregando…</p>}
                        {painel && (
                            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-6 lg:items-stretch">
                                {ORDEM.map((e) => (
                                    <section key={e}
                                        onDragOver={(ev) => { ev.preventDefault(); setSobre(e); }}
                                        onDragLeave={() => setSobre((s) => (s === e ? null : s))}
                                        onDrop={(ev) => { ev.preventDefault(); const c = cards.find((x) => x.id === arrastando); setSobre(null); setArrastando(null); if (c) moverPara(c, e); }}
                                        className={`${aba === e ? "flex" : "hidden"} min-w-0 flex-col gap-2 lg:min-h-[420px] rounded-2xl border-t-4 bg-[#E9EDF3] p-2 lg:flex dark:bg-[#232B3F] ${COR[e]} ${sobre === e ? "ring-2 ring-[#3D6A99]" : ""}`}>
                                        <h2 className="m-0 flex items-center gap-2 px-1 pt-1 text-[14.5px] font-extrabold">
                                            <span className="flex-1">{etapas[e] || e}</span>
                                            <span className="rounded-full bg-white px-2 text-[13px] dark:bg-[#1C2334]">{porEtapa(e).length}</span>
                                        </h2>
                                        {!porEtapa(e).length && <p className="m-0 px-1 pb-2 text-[13px] text-[#6B7488]">Nenhum.</p>}
                                        {porEtapa(e).map((c) => cardMini(c))}
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>

                    {form && (
                        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={(ev) => { if (ev.target === ev.currentTarget) fechar(); }}>
                        <aside className={`${CARTAO} flex max-h-[92vh] w-full max-w-[720px] flex-col gap-3 overflow-y-auto rounded-b-none sm:rounded-b-2xl`}>
                            <div className="flex items-center gap-2">
                                <h2 className="m-0 min-w-0 flex-1 truncate text-[19px] font-extrabold">{form.id ? form.nome || fone(aberto?.telefone || "") || "Lead" : "Novo lead"}</h2>
                                <button type="button" className={BTN_SEC} onClick={fechar}>Fechar</button>
                            </div>
                            {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                            {aberto && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[14px]">Etapa: <b>{etapas[aberto.etapa]}</b> desde {dt(aberto.etapa_em)}{aberto.proposta_id ? ` · proposta #${aberto.proposta_id}` : ""}</span>
                                    <div className="flex flex-wrap gap-2">
                                        <select className={`${CAMPO} h-11 flex-1`} value="" onChange={(ev) => {
                                            const e = ev.target.value as Etapa;
                                            if (!e) return;
                                            if (e === "perdido" || e === "fechado") setMover({ etapa: e, motivo: "", contrato: aberto.contrato || "" });
                                            else moverPara(aberto, e);
                                        }} aria-label="Mover para">
                                            <option value="">Mover para…</option>
                                            {ORDEM.filter((e) => e !== aberto.etapa).map((e) => <option key={e} value={e}>{etapas[e]}</option>)}
                                        </select>
                                        {aberto.conversa_id && <a className={`${BTN_SEC} leading-[44px]`} href={`/messenger?conversa=${aberto.conversa_id}`}>Abrir conversa</a>}
                                    </div>
                                    {mover && (
                                        <div className="flex flex-col gap-2 rounded-xl bg-[#F4F6F9] p-3 dark:bg-[#1C2334]">
                                            <b className="text-[14.5px]">Mover para {etapas[mover.etapa]}</b>
                                            {mover.etapa === "perdido" ? (
                                                <input className={CAMPO} value={mover.motivo} onChange={(ev) => setMover({ ...mover, motivo: ev.target.value })} placeholder="Motivo (ex.: achou caro, fechou com outra empresa)" />
                                            ) : (
                                                <input className={CAMPO} inputMode="numeric" value={mover.contrato} onChange={(ev) => setMover({ ...mover, contrato: ev.target.value })} placeholder="Número do contrato (opcional)" />
                                            )}
                                            <div className="flex gap-2">
                                                <button type="button" className={BTN_PRI} disabled={ocupado || (mover.etapa === "perdido" && !mover.motivo.trim())} onClick={() => moverPara(aberto, mover.etapa, mover.motivo.trim(), mover.contrato)}>Confirmar</button>
                                                <button type="button" className={BTN_SEC} onClick={() => setMover(null)}>Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                    {aberto.etapa === "perdido" && aberto.motivo_perda && <span className="text-[14px]">Motivo da perda: {aberto.motivo_perda}</span>}
                                </div>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="sm:col-span-2"><span className={ROTULO}>Nome</span>
                                    <input className={CAMPO} value={form.nome} maxLength={150} onChange={(ev) => setForm({ ...form, nome: ev.target.value })} />
                                </label>
                                <label><span className={ROTULO}>Telefone</span>
                                    <input className={CAMPO} inputMode="tel" value={form.telefone} onChange={(ev) => setForm({ ...form, telefone: ev.target.value })} />
                                </label>
                                <label><span className={ROTULO}>Cidade</span>
                                    <input className={CAMPO} value={form.cidade} maxLength={80} onChange={(ev) => setForm({ ...form, cidade: ev.target.value })} />
                                </label>
                                <label><span className={ROTULO}>Plano</span>
                                    <select className={CAMPO} value={form.plano} onChange={(ev) => setForm({ ...form, plano: ev.target.value })}>
                                        <option value="">—</option>
                                        {["LIGHT", "FLEX", "PLUS", "MAX"].map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </label>
                                <label><span className={ROTULO}>Pessoas</span>
                                    <input className={CAMPO} inputMode="numeric" value={form.pessoas} onChange={(ev) => setForm({ ...form, pessoas: ev.target.value.replace(/\D/g, "") })} />
                                </label>
                                <label><span className={ROTULO}>Mensalidade (R$)</span>
                                    <input className={CAMPO} inputMode="decimal" value={form.valor_mensal} onChange={(ev) => setForm({ ...form, valor_mensal: ev.target.value })} />
                                </label>
                                <label><span className={ROTULO}>Origem</span>
                                    <input className={CAMPO} value={form.origem} maxLength={200} onChange={(ev) => setForm({ ...form, origem: ev.target.value })} placeholder="Anúncio, indicação, site…" />
                                </label>
                                <label className="sm:col-span-2"><span className={ROTULO}>Interesse</span>
                                    <textarea className={`${CAMPO} h-20 py-2`} value={form.interesse} maxLength={400} onChange={(ev) => setForm({ ...form, interesse: ev.target.value })} />
                                </label>
                                <label><span className={ROTULO}>Responsável</span>
                                    <select className={CAMPO} value={form.responsavel_id} onChange={(ev) => setForm({ ...form, responsavel_id: ev.target.value })}>
                                        <option value="">Ninguém</option>
                                        {(painel?.equipe || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                    </select>
                                </label>
                                <label><span className={ROTULO}>Próximo contato</span>
                                    <input className={CAMPO} type="date" value={form.proximo_contato} onChange={(ev) => setForm({ ...form, proximo_contato: ev.target.value })} />
                                </label>
                                <label className="sm:col-span-2"><span className={ROTULO}>Próximo passo</span>
                                    <input className={CAMPO} value={form.proximo_passo} maxLength={300} onChange={(ev) => setForm({ ...form, proximo_passo: ev.target.value })} />
                                </label>
                                <label className="sm:col-span-2"><span className={ROTULO}>Anotações</span>
                                    <textarea className={`${CAMPO} h-24 py-2`} value={form.notas} onChange={(ev) => setForm({ ...form, notas: ev.target.value })} />
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" className={BTN_PRI} disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : form.id ? "Salvar" : "Incluir no funil"}</button>
                                <button type="button" className={BTN_SEC} onClick={fechar}>Cancelar</button>
                            </div>
                            {hist.length > 0 && (
                                <div className="flex flex-col gap-1 border-t border-[#EEF0F3] pt-3 dark:border-white/10">
                                    <b className="text-[14.5px]">Histórico</b>
                                    {hist.map((h, i) => (
                                        <p key={i} className="m-0 text-[13.5px]">
                                            <span className="text-[#6B7488] dark:text-[#AEB9CF]">{dt(h.em)} · {h.quem}</span><br />
                                            {h.para && h.de !== h.para ? <b>{h.de ? `${etapas[h.de as Etapa] || h.de} → ` : ""}{etapas[h.para as Etapa] || h.para}. </b> : null}
                                            {h.texto}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </aside>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
