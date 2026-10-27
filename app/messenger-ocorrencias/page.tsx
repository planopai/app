"use client";

/**
 * Ocorrências (27/10/2026) — rota /messenger-ocorrencias
 * Problemas que a Aurora acompanhante levanta ao ler cada atendimento encerrado (reclamação, cliente insatisfeito, risco de
 * cancelamento, erro de cobrança, promessa não cumprida, falha no atendimento), para a Gestão tratar e registrar o que foi
 * feito. Gravidade alta notifica a Gestão. Aqui também fica a configuração da Aurora acompanhante (liga/desliga e funções).
 * Servidor: aurora_04.php (arquivo novo). Acesso: só a Gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_04.php`;

type Item = {
    id: number; conversa_id: number; atendimento_id: number | null; cliente: string | null; telefone: string | null; contrato: string | null;
    tipo: string; gravidade: "baixa" | "media" | "alta"; descricao: string; trecho: string | null; status: string; tratativa: string | null; origem: string;
    responsavel_id: number | null; responsavel: string | null; criado_em: string | null; atualizado_em: string | null; resolvido_em: string | null; resolvido_por: string | null;
};
type Config = {
    ativo: boolean; etiquetas: boolean; ocorrencias: boolean; leads: boolean; desde: string; ia_ok: boolean;
    ultima: { inicio?: string; fim?: string; origem?: string; msg?: string; erros?: string[] } | null;
};
type Lista = {
    itens: Item[]; contagem: Record<string, number>; tipos: Record<string, string>; gravidades: Record<string, string>; status: Record<string, string>;
    equipe: { id: number; nome: string }[]; config: Config;
};

const GRAV: Record<string, string> = {
    alta: "bg-[#FDECEA] text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]",
    media: "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
    baixa: "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]",
};
const SIT: Record<string, string> = {
    aberta: "bg-[#E9EFF6] text-[#1E3A5C] dark:bg-[#3D6A99]/25 dark:text-white",
    tratando: "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
    resolvida: "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]",
    descartada: "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]",
};
const FILTROS: [string, string][] = [["abertas", "Abertas e em tratamento"], ["aberta", "Abertas"], ["tratando", "Em tratamento"], ["resolvida", "Resolvidas"], ["descartada", "Descartadas"], ["todas", "Todas"]];
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fone = (t: string | null) => {
    const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : t || "";
};

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

const BTN = "h-11 min-w-[44px] rounded-xl px-4 text-[14.5px] font-extrabold disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[#C9D1DE] bg-white dark:border-white/15 dark:bg-transparent`;
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const ROTULO = "mb-1 block text-[13.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]";

function Chave({ ligado, rotulo, desc, onChange, disabled }: { ligado: boolean; rotulo: string; desc: string; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <label className={`flex items-start gap-3 rounded-xl bg-[#F4F6F9] p-3 dark:bg-[#1C2334] ${disabled ? "opacity-60" : "cursor-pointer"}`}>
            <input type="checkbox" className="mt-1 size-5 shrink-0" checked={ligado} disabled={disabled} onChange={(ev) => onChange(ev.target.checked)} />
            <span className="min-w-0">
                <b className="block text-[15px]">{rotulo}</b>
                <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{desc}</span>
            </span>
        </label>
    );
}

export default function OcorrenciasPage() {
    const [filtro, setFiltro] = useState("abertas");
    const [grav, setGrav] = useState("");
    const [tipo, setTipo] = useState("");
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [lista, setLista] = useState<Lista | null>(null);
    const [selId, setSelId] = useState<number | null>(null);
    const [edit, setEdit] = useState<{ status: string; tratativa: string; gravidade: string; responsavel_id: string } | null>(null);
    const [verConfig, setVerConfig] = useState(false);
    const [atdTeste, setAtdTeste] = useState("");
    const [ocupado, setOcupado] = useState("");
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [semAcesso, setSemAcesso] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const d = await aGet<Lista>("ocorrencias", { status: filtro, gravidade: grav, tipo, q: buscaAplicada });
            setLista(d);
        } catch (e: any) {
            if (e?.status === 403) setSemAcesso(true);
            else setErro(e?.message || "Não foi possível carregar as ocorrências.");
        }
    }, [filtro, grav, tipo, buscaAplicada]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const itens = lista?.itens || [];
    const sel = itens.find((i) => i.id === selId) || null;
    const cfg = lista?.config;

    function selecionar(i: Item) {
        setSelId(i.id);
        setEdit({ status: i.status, tratativa: i.tratativa || "", gravidade: i.gravidade, responsavel_id: i.responsavel_id ? String(i.responsavel_id) : "" });
        setErro("");
        setAviso("");
    }

    async function executar(rotulo: string, fn: () => Promise<any>) {
        setOcupado(rotulo);
        setErro("");
        setAviso("");
        try {
            const j = await fn();
            if (j?.msg) setAviso(j.msg);
            await carregar();
            return j;
        } catch (e: any) {
            setErro(e?.message || "Falha na operação.");
            return null;
        } finally {
            setOcupado("");
        }
    }

    async function salvar(status?: string) {
        if (!sel || !edit) return;
        const corpo = { id: sel.id, ...edit, status: status || edit.status };
        const j = await executar("salvar", () => aPost("ocorrencia_salvar", corpo));
        if (j && status) setEdit({ ...edit, status });
    }

    function config(mudanca: Partial<Config>) {
        if (!cfg) return;
        const novo = { ativo: cfg.ativo, etiquetas: cfg.etiquetas, ocorrencias: cfg.ocorrencias, leads: cfg.leads, ...mudanca };
        executar("config", () => aPost("config_salvar", novo));
    }

    if (semAcesso) {
        return (
            <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
                <div className={`mx-auto max-w-[700px] ${CARTAO}`}>
                    <h1 className="m-0 text-2xl font-extrabold">Ocorrências</h1>
                    <p className="mt-2 text-[15px]">Esta tela é só da Gestão.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Ocorrências</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">O que a Aurora encontrou nos atendimentos encerrados e precisa da Gestão: reclamações, risco de cancelamento, erros de cobrança, promessas e falhas.</p>
                    </div>
                    <button type="button" className={BTN_SEC} onClick={() => setVerConfig(!verConfig)} aria-expanded={verConfig}>
                        Aurora acompanhante · {cfg ? (cfg.ativo ? "ligada" : "desligada") : "…"}
                    </button>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207]">{aviso}</div>}

                {verConfig && cfg && (
                    <section className={`${CARTAO} flex flex-col gap-3`}>
                        <h2 className="m-0 text-[19px] font-extrabold">Aurora acompanhante</h2>
                        <p className="m-0 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Depois que cada atendimento de cliente é encerrado, a Aurora lê a conversa uma vez (a cada 15 minutos, pelo cron) e faz o que estiver ligado abaixo.
                            {cfg.desde ? ` Analisa os atendimentos encerrados desde ${dt(cfg.desde.replace(" ", "T"))}.` : ""}
                        </p>
                        {!cfg.ia_ok && <div className="rounded-xl bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318]">Falta a chave da IA (openai_api_key) no pai-chaves.php.</div>}
                        <Chave ligado={cfg.ativo} rotulo="Ligada" desc="Liga ou desliga a análise dos atendimentos. Ao ligar, só entram os atendimentos encerrados daqui em diante." onChange={(v) => config({ ativo: v })} disabled={!!ocupado} />
                        <div className="grid gap-2 md:grid-cols-3">
                            <Chave ligado={cfg.etiquetas} rotulo="Etiquetar" desc="Acrescenta as etiquetas da empresa que faltam, sem passar do limite por conversa." onChange={(v) => config({ etiquetas: v })} disabled={!!ocupado} />
                            <Chave ligado={cfg.ocorrencias} rotulo="Ocorrências" desc="Registra os problemas nesta tela; gravidade alta notifica a Gestão." onChange={(v) => config({ ocorrencias: v })} disabled={!!ocupado} />
                            <Chave ligado={cfg.leads} rotulo="Leads" desc="Quem pediu plano e não é associado vira card no Funil de vendas." onChange={(v) => config({ leads: v })} disabled={!!ocupado} />
                        </div>
                        {cfg.ultima && (
                            <p className="m-0 text-[13.5px]">
                                Última execução: {dt(cfg.ultima.fim || cfg.ultima.inicio)} ({cfg.ultima.origem === "cron" ? "automática" : cfg.ultima.origem}) · {cfg.ultima.msg}
                                {cfg.ultima.erros && cfg.ultima.erros.length > 0 && <span className="text-[#B42318]"> · Erros: {cfg.ultima.erros.join(" | ")}</span>}
                            </p>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                            <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={() => executar("rodar", () => aPost("rodar"))}>{ocupado === "rodar" ? "Rodando…" : "Rodar agora"}</button>
                            <label className="flex-1 md:max-w-[260px]"><span className={ROTULO}>Testar em um atendimento encerrado (nº)</span>
                                <input className={CAMPO} inputMode="numeric" value={atdTeste} onChange={(ev) => setAtdTeste(ev.target.value.replace(/\D/g, ""))} placeholder="ex.: 1234" />
                            </label>
                            <button type="button" className={BTN_SEC} disabled={!!ocupado || !atdTeste} onClick={() => executar("analisar", () => aPost("analisar", { atendimento_id: Number(atdTeste) }))}>{ocupado === "analisar" ? "Analisando…" : "Analisar"}</button>
                        </div>
                        <p className="m-0 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">O teste analisa o atendimento mesmo com a Aurora desligada e grava o resultado de verdade (etiquetas, ocorrências e lead). O número do atendimento aparece no Histórico de clientes.</p>
                        <code className="block break-all rounded-xl bg-[#F4F6F9] p-3 text-[13px] dark:bg-[#1C2334]">0,15,30,45 * * * * /usr/local/bin/php /home2/pla48587/api.planoassistencialintegrado.com.br/aurora_04.php acompanhar</code>
                    </section>
                )}

                <div className="flex flex-col gap-3">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {FILTROS.map(([k, nome]) => {
                            const c = lista?.contagem || {};
                            const n = k === "abertas" ? (c.aberta || 0) + (c.tratando || 0) : k === "todas" ? null : c[k] || 0;
                            return (
                                <button key={k} type="button" aria-pressed={filtro === k} onClick={() => { setFiltro(k); setSelId(null); }}
                                    className={`h-11 shrink-0 rounded-full px-4 text-[14.5px] ${filtro === k ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>
                                    {nome}{n !== null ? ` · ${n}` : ""}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row">
                        <select className={`${CAMPO} md:w-[200px]`} value={grav} onChange={(ev) => setGrav(ev.target.value)} aria-label="Gravidade">
                            <option value="">Todas as gravidades</option>
                            {Object.entries(lista?.gravidades || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select className={`${CAMPO} md:w-[240px]`} value={tipo} onChange={(ev) => setTipo(ev.target.value)} aria-label="Tipo">
                            <option value="">Todos os tipos</option>
                            {Object.entries(lista?.tipos || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <form className="flex flex-1 gap-2" onSubmit={(ev) => { ev.preventDefault(); setBuscaAplicada(busca.trim()); }}>
                            <input className={CAMPO} value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Cliente, telefone, contrato ou texto" />
                            <button type="submit" className={BTN_PRI}>Buscar</button>
                        </form>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <section className={`rounded-2xl border border-[#E1E5EC] bg-white p-2 dark:border-white/12 dark:bg-[#232B3F] ${sel ? "hidden lg:block" : ""}`}>
                        {!lista && !erro && <p className="p-4">Carregando…</p>}
                        {lista && !itens.length && <p className="p-4 text-[#6B7488]">Nenhuma ocorrência aqui.</p>}
                        {itens.map((i) => (
                            <button key={i.id} type="button" onClick={() => selecionar(i)}
                                className={`flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/5 ${selId === i.id ? "bg-[#F0F2F5] dark:bg-white/10" : ""}`}>
                                <span className="flex items-center gap-2">
                                    <b className="min-w-0 flex-1 truncate text-[15.5px]">{i.cliente || fone(i.telefone) || "Cliente"}</b>
                                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[12.5px] font-extrabold ${GRAV[i.gravidade]}`}>{lista?.gravidades[i.gravidade] || i.gravidade}</span>
                                </span>
                                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                                    <b>{lista?.tipos[i.tipo] || i.tipo}</b>
                                    <span className={`rounded-lg px-2 py-0.5 font-bold ${SIT[i.status] || ""}`}>{lista?.status[i.status] || i.status}</span>
                                    <span className="text-[#6B7488] dark:text-[#AEB9CF]">{dt(i.criado_em)}</span>
                                </span>
                                <span className="line-clamp-2 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{i.descricao}</span>
                            </button>
                        ))}
                    </section>

                    <section className={`${CARTAO} ${sel ? "" : "hidden lg:block"}`}>
                        {!sel && <p className="m-0 text-[#6B7488]">Escolha uma ocorrência para tratar.</p>}
                        {sel && edit && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-start gap-2">
                                    <button type="button" className={`${BTN_SEC} lg:hidden`} onClick={() => setSelId(null)} aria-label="Voltar">←</button>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="m-0 text-[19px] font-extrabold">{sel.cliente || fone(sel.telefone) || "Cliente"}</h2>
                                        <p className="m-0 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                                            {fone(sel.telefone)}{sel.contrato ? ` · contrato ${sel.contrato}` : ""}{sel.atendimento_id ? ` · atendimento #${sel.atendimento_id}` : ""} · {dt(sel.criado_em)}{sel.origem === "aurora" ? " · pela Aurora" : ""}
                                        </p>
                                    </div>
                                    <a className={`${BTN_SEC} shrink-0 leading-[44px]`} href={`/messenger?conversa=${sel.conversa_id}`}>Abrir conversa</a>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-lg bg-[#313C55] px-2 py-0.5 text-[13px] font-extrabold text-white">{lista?.tipos[sel.tipo] || sel.tipo}</span>
                                    <span className={`rounded-lg px-2 py-0.5 text-[13px] font-extrabold ${SIT[sel.status] || ""}`}>{lista?.status[sel.status] || sel.status}</span>
                                </div>
                                <p className="m-0 text-[15.5px]">{sel.descricao}</p>
                                {sel.trecho && <blockquote className="m-0 border-l-4 border-[#C9D1DE] pl-3 text-[14.5px] italic text-[#4A5468] dark:text-[#AEB9CF]">“{sel.trecho}”</blockquote>}
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label><span className={ROTULO}>Gravidade</span>
                                        <select className={CAMPO} value={edit.gravidade} onChange={(ev) => setEdit({ ...edit, gravidade: ev.target.value })}>
                                            {Object.entries(lista?.gravidades || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </label>
                                    <label><span className={ROTULO}>Responsável</span>
                                        <select className={CAMPO} value={edit.responsavel_id} onChange={(ev) => setEdit({ ...edit, responsavel_id: ev.target.value })}>
                                            <option value="">Ninguém</option>
                                            {(lista?.equipe || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <label><span className={ROTULO}>O que foi feito</span>
                                    <textarea className={`${CAMPO} h-28 py-2`} value={edit.tratativa} onChange={(ev) => setEdit({ ...edit, tratativa: ev.target.value })} placeholder="Ex.: liguei para o cliente, expliquei o valor e ajustei a parcela" />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={() => salvar()}>{ocupado === "salvar" ? "Salvando…" : "Salvar"}</button>
                                    {sel.status !== "tratando" && sel.status !== "resolvida" && <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={() => salvar("tratando")}>Em tratamento</button>}
                                    {sel.status !== "resolvida" && <button type="button" className={`${BTN} bg-[#4C9A2A] text-white`} disabled={!!ocupado || !edit.tratativa.trim()} onClick={() => salvar("resolvida")}>Resolvida</button>}
                                    {sel.status !== "descartada" && sel.status !== "resolvida" && <button type="button" className={BTN_SEC} disabled={!!ocupado || !edit.tratativa.trim()} onClick={() => salvar("descartada")}>Descartar</button>}
                                    {(sel.status === "resolvida" || sel.status === "descartada") && <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={() => salvar("aberta")}>Reabrir</button>}
                                </div>
                                {!edit.tratativa.trim() && sel.status !== "resolvida" && <p className="m-0 text-[13px] text-[#6B7488]">Para resolver ou descartar, escreva o que foi feito.</p>}
                                {sel.resolvido_em && <p className="m-0 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{sel.status === "descartada" ? "Descartada" : "Resolvida"} por {sel.resolvido_por || "—"} em {dt(sel.resolvido_em)}</p>}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
