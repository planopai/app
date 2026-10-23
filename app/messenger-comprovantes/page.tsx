"use client";

/**
 * Comprovantes (23/10/2026) — rota /messenger-comprovantes
 * Fotos e PDFs que os clientes mandam no WhatsApp. A Aurora lê cada um (valor, data, quem pagou e recebeu);
 * o responsável confere com o contrato vinculado ao número e marca "Baixa registrada" (a baixa é feita no UnyPax).
 * Número sem contrato é vinculado aqui mesmo (mesmo vínculo da conversa).
 * Servidor: aurora_01.php (arquivo novo; não usa o messenger.php). Acesso: página "messenger".
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_01.php`;

type Vinculo = { contrato: string; titular: string | null; plano: string | null; relacao: string; pode_pagar: boolean };
type Item = {
    id: number; situacao: "A" | "P" | "B" | "D" | "N"; recebido_em: string | null; conversa_id: number; contato_id: number;
    nome: string | null; telefone: string | null; contrato: string | null; vinculos: Vinculo[];
    valor: number | null; pago_em: string | null; obs: string | null; mime: string | null; anexo_id: number | null;
    baixa_por: string | null; baixa_em: string | null;
};
type Lista = { itens: Item[]; contagem: Record<string, number>; a_ler: number };
type Parcela = { parcela: string; valor: number; vencimento: string };
type Parcelas = { titular: string; vencidas: Parcela[]; abertas: Parcela[]; total_vencido: number };
type Achado = { contrato: string; titular: string; plano: string; cidade: string; cpf: string };

const SIT: Record<string, [string, string]> = {
    A: ["Aurora lendo", "bg-[#E9EFF6] text-[#1E3A5C] dark:bg-[#3D6A99]/25 dark:text-white"],
    P: ["Pendente", "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]"],
    B: ["Baixa registrada", "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]"],
    D: ["Divergente", "bg-[#FDECEA] text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]"],
    N: ["Não é comprovante", "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"],
};
const FILTROS: [string, string, string[]][] = [
    ["pendentes", "Pendentes", ["A", "P", "D"]],
    ["B", "Baixa registrada", ["B"]],
    ["D", "Divergentes", ["D"]],
    ["N", "Não é comprovante", ["N"]],
    ["todos", "Todos", []],
];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dataBr = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
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
const CAMPO = "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";

export default function ComprovantesPage() {
    const [filtro, setFiltro] = useState("pendentes");
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [lista, setLista] = useState<Lista | null>(null);
    const [selId, setSelId] = useState<number | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [lendo, setLendo] = useState(0);
    const lendoRef = useRef(false);

    const carregar = useCallback(async () => {
        try {
            const d = await aGet<Lista>("lista", { situacao: filtro, busca: buscaAplicada });
            setLista(d);
            setErro("");
            return d;
        } catch (e: any) {
            setErro(e.message);
            return null;
        }
    }, [filtro, buscaAplicada]);

    // a Aurora lê os arquivos novos em lotes; a lista é recarregada a cada lote
    const lerPendentes = useCallback(async () => {
        if (lendoRef.current) return;
        lendoRef.current = true;
        try {
            for (let i = 0; i < 30; i++) {
                const r = await aPost("ler");
                setLendo(r.dados?.faltam || 0);
                await carregar();
                if (!r.dados?.faltam || !r.dados?.lidos) break;
            }
        } catch (e: any) {
            setErro(e.message);
        } finally {
            lendoRef.current = false;
            setLendo(0);
        }
    }, [carregar]);

    useEffect(() => {
        let ativo = true;
        carregar().then((d) => {
            if (ativo && d && d.a_ler > 0) {
                setLendo(d.a_ler);
                lerPendentes();
            }
        });
        return () => {
            ativo = false;
        };
    }, [carregar, lerPendentes]);

    const itens = lista?.itens || [];
    const sel = itens.find((i) => i.id === selId) || null;
    const contar = (sits: string[]) => (sits.length ? sits.reduce((s, k) => s + (lista?.contagem?.[k] || 0), 0) : null);

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Comprovantes</h1>
                    <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Fotos e PDFs que os clientes mandam no WhatsApp. A Aurora lê o valor e a data; confira com o contrato, dê a baixa no UnyPax e marque aqui como registrada.</p>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207]">{aviso}</div>}
                {lendo > 0 && <div className="rounded-xl bg-[#E9EFF6] px-4 py-2 text-sm font-bold text-[#1E3A5C] dark:bg-[#3D6A99]/25 dark:text-white">A Aurora está lendo {lendo} {lendo === 1 ? "arquivo" : "arquivos"}…</div>}

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {FILTROS.map(([k, nome, sits]) => {
                            const n = contar(sits);
                            return (
                                <button key={k} type="button" onClick={() => { setFiltro(k); setSelId(null); }} aria-pressed={filtro === k}
                                    className={`h-11 shrink-0 rounded-full px-4 text-[14.5px] ${filtro === k ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>
                                    {nome}{n !== null ? ` · ${n}` : ""}
                                </button>
                            );
                        })}
                    </div>
                    <form className="flex gap-2 lg:ml-auto lg:w-[360px]" onSubmit={(ev) => { ev.preventDefault(); setBuscaAplicada(busca.trim()); }}>
                        <input className={CAMPO} value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Nome, telefone ou contrato" />
                        <button type="submit" className={`${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`}>Buscar</button>
                    </form>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
                    <section className={`rounded-2xl border border-[#E1E5EC] bg-white p-2 dark:border-white/12 dark:bg-[#232B3F] ${sel ? "hidden lg:block" : ""}`}>
                        {!lista && <p className="p-4">Carregando…</p>}
                        {lista && !itens.length && <p className="p-4 text-[#6B7488]">Nenhum comprovante aqui.</p>}
                        {itens.map((c) => (
                            <button key={c.id} type="button" onClick={() => { setSelId(c.id); setAviso(""); }}
                                className={`flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/5 ${selId === c.id ? "bg-[#F0F2F5] dark:bg-white/10" : ""}`}>
                                <span className="flex items-center gap-2">
                                    <b className="min-w-0 flex-1 truncate text-[15.5px]">{c.nome || fone(c.telefone) || "Sem nome"}</b>
                                    {c.valor !== null && <b className="text-[15px]">{brl(c.valor)}</b>}
                                </span>
                                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                                    <span className={`rounded-lg px-2 py-0.5 font-extrabold ${SIT[c.situacao]?.[1] || ""}`}>{SIT[c.situacao]?.[0] || c.situacao}</span>
                                    {c.contrato ? <span className="rounded-lg bg-[#313C55] px-2 py-0.5 font-extrabold text-white">Contrato {c.contrato}</span> : <span className="rounded-lg border border-[#C9D1DE] px-2 py-0.5 font-bold">Sem contrato</span>}
                                    <span className="text-[#6B7488] dark:text-[#AEB9CF]">{dt(c.recebido_em)}</span>
                                </span>
                            </button>
                        ))}
                    </section>
                    <section className={`rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F] ${sel ? "" : "hidden lg:block"}`}>
                        {!sel && <p className="text-[#6B7488]">Escolha um comprovante.</p>}
                        {sel && <Detalhe key={sel.id} item={sel} voltar={() => setSelId(null)} aoMudar={async (msg) => { setAviso(msg); await carregar(); }} aoErro={setErro} />}
                    </section>
                </div>
            </div>
        </div>
    );
}

function Detalhe({ item, voltar, aoMudar, aoErro }: { item: Item; voltar: () => void; aoMudar: (msg: string) => Promise<void>; aoErro: (m: string) => void }) {
    const [arquivo, setArquivo] = useState<{ url: string; mime: string } | null>(null);
    const [parcelas, setParcelas] = useState<Parcelas | null>(null);
    const [carregandoParcelas, setCarregandoParcelas] = useState(false);
    const [contrato, setContrato] = useState(item.contrato || item.vinculos[0]?.contrato || "");
    const [nota, setNota] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [q, setQ] = useState("");
    const [achados, setAchados] = useState<Achado[] | null>(null);
    const [relacao, setRelacao] = useState("titular");

    useEffect(() => {
        let ativo = true;
        aGet<{ url: string; mime: string }>("arquivo", { id: item.id })
            .then((a) => {
                if (ativo) setArquivo(a);
            })
            .catch((e) => aoErro(e.message));
        return () => {
            ativo = false;
        };
    }, [item.id, aoErro]);

    const verParcelas = async () => {
        if (!contrato) return;
        setCarregandoParcelas(true);
        try {
            setParcelas(await aGet<Parcelas>("parcelas", { contrato }));
        } catch (e: any) {
            aoErro(e.message);
        } finally {
            setCarregandoParcelas(false);
        }
    };
    const marcar = async (situacao: string) => {
        setSalvando(true);
        try {
            const r = await aPost("marcar", { id: item.id, situacao, nota, contrato });
            await aoMudar(r.msg);
        } catch (e: any) {
            aoErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    const buscar = async () => {
        try {
            setAchados(await aGet<Achado[]>("contratos_buscar", { q }));
        } catch (e: any) {
            aoErro(e.message);
        }
    };
    const vincular = async (n: string) => {
        setSalvando(true);
        try {
            const r = await aPost("vincular", { id: item.id, contrato: n, relacao, pode_pagar: true });
            setContrato(r.dados?.contrato || n);
            setAchados(null);
            setQ("");
            await aoMudar(r.msg);
        } catch (e: any) {
            aoErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    const ehPdf = (arquivo?.mime || item.mime) === "application/pdf";
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={voltar} className={`${BTN} border border-[#C9D1DE] lg:hidden`}>Voltar</button>
                <h2 className="m-0 min-w-0 flex-1 truncate text-xl font-extrabold">{item.nome || fone(item.telefone) || "Sem nome"}</h2>
                <span className={`rounded-lg px-2 py-0.5 text-[13px] font-extrabold ${SIT[item.situacao]?.[1] || ""}`}>{SIT[item.situacao]?.[0]}</span>
                <a href={`/messenger?conversa=${item.conversa_id}`} className={`${BTN} border border-[#C9D1DE] leading-[44px]`}>Abrir conversa</a>
            </div>
            <p className="m-0 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">{fone(item.telefone)} · recebido em {dt(item.recebido_em)}</p>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl bg-[#F1F4F8] dark:bg-[#1C2334]">
                    {!arquivo && <span className="text-[#6B7488]">Carregando o arquivo…</span>}
                    {arquivo && !ehPdf && (
                        <a href={arquivo.url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={arquivo.url} alt="Comprovante enviado pelo cliente" className="max-h-[560px] w-auto object-contain" />
                        </a>
                    )}
                    {arquivo && ehPdf && <a href={arquivo.url} target="_blank" rel="noreferrer" className={`${BTN} bg-[#313C55] leading-[44px] text-white`}>Abrir o PDF</a>}
                </div>

                <div className="flex flex-col gap-4">
                    <div className="rounded-xl bg-[#F6F8FB] p-3 text-[14.5px] dark:bg-white/5">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                            <span>Valor <b>{item.valor !== null ? brl(item.valor) : "—"}</b></span>
                            <span>Pago em <b>{dataBr(item.pago_em)}</b></span>
                        </div>
                        {item.obs && <p className="mb-0 mt-2 break-words">{item.obs}</p>}
                        {item.situacao === "B" && <p className="mb-0 mt-2 font-bold text-[#2F4207] dark:text-[#D5E79A]">Baixa registrada por {item.baixa_por || "—"} em {dt(item.baixa_em)}.</p>}
                    </div>

                    <div>
                        <div className="mb-2 text-[12px] font-extrabold uppercase tracking-wider text-[#3D6A99]">Contrato</div>
                        {item.vinculos.length > 0 ? (
                            <div className="flex flex-col gap-2">
                                {item.vinculos.map((v) => (
                                    <label key={v.contrato} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${contrato === v.contrato ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "border-[#E1E5EC] dark:border-white/12"}`}>
                                        <input type="radio" name="contrato" checked={contrato === v.contrato} onChange={() => { setContrato(v.contrato); setParcelas(null); }} />
                                        <span className="min-w-0 flex-1"><b>{v.contrato}</b> · {v.titular || "—"}{v.plano ? ` · ${v.plano}` : ""}<span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">número ligado como {v.relacao}</span></span>
                                    </label>
                                ))}
                                <button type="button" onClick={verParcelas} disabled={!contrato || carregandoParcelas} className={`${BTN} self-start border border-[#C9D1DE]`}>{carregandoParcelas ? "Consultando…" : "Ver parcelas em aberto"}</button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <p className="m-0 text-[14.5px]">Este número ainda não está ligado a um contrato. Busque pelo número do contrato, CPF ou nome do titular.</p>
                                <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); buscar(); }}>
                                    <input className={CAMPO} value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Contrato, CPF ou nome" />
                                    <button type="submit" disabled={q.trim().length < 3} className={`${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`}>Buscar</button>
                                </form>
                                {achados && (
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[12px] font-extrabold uppercase text-[#5B6478]">Quem escreve é
                                            <select className={`${CAMPO} mt-1`} value={relacao} onChange={(ev) => setRelacao(ev.target.value)}>
                                                <option value="titular">Titular</option><option value="conjuge">Cônjuge</option><option value="filho">Filho(a)</option>
                                                <option value="dependente">Dependente</option><option value="familiar">Familiar</option><option value="responsavel">Responsável</option><option value="outro">Outro</option>
                                            </select>
                                        </label>
                                        {!achados.length && <p className="m-0 text-[#6B7488]">Nenhum contrato encontrado.</p>}
                                        {achados.map((a) => (
                                            <div key={a.contrato} className="flex items-center gap-2 rounded-xl border border-[#E1E5EC] px-3 py-2 dark:border-white/12">
                                                <span className="min-w-0 flex-1 text-[14.5px]"><b>{a.contrato}</b> · {a.titular}<span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{[a.plano, a.cidade, a.cpf].filter(Boolean).join(" · ")}</span></span>
                                                <button type="button" disabled={salvando} onClick={() => vincular(a.contrato)} className={`${BTN} bg-[#313C55] text-white dark:bg-[#3D6A99]`}>Vincular</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {parcelas && (
                            <div className="mt-3 rounded-xl border border-[#E1E5EC] p-3 text-[14px] dark:border-white/12">
                                <b>{parcelas.titular}</b>
                                {[...parcelas.vencidas.map((p) => ({ ...p, v: true })), ...parcelas.abertas.map((p) => ({ ...p, v: false }))].length === 0 && <p className="m-0 mt-1">Nenhuma parcela em aberto: pode já ter sido baixada.</p>}
                                {parcelas.vencidas.map((p) => <div key={`v${p.parcela}${p.vencimento}`} className="flex justify-between gap-2 py-0.5 text-[#B42318] dark:text-[#FF9C92]"><span>{p.parcela || "Parcela"} · venceu {dataBr(p.vencimento)}</span><b>{brl(p.valor)}</b></div>)}
                                {parcelas.abertas.filter((p) => !parcelas.vencidas.some((x) => x.vencimento === p.vencimento && x.valor === p.valor)).map((p) => <div key={`a${p.parcela}${p.vencimento}`} className="flex justify-between gap-2 py-0.5"><span>{p.parcela || "Parcela"} · vence {dataBr(p.vencimento)}</span><b>{brl(p.valor)}</b></div>)}
                            </div>
                        )}
                    </div>

                    <label className="block">
                        <span className="text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Observação (opcional)</span>
                        <input className={`${CAMPO} mt-1`} value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Ex.: baixa nas parcelas de setembro e outubro" maxLength={120} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {item.situacao !== "B" && <button type="button" disabled={salvando || !contrato} onClick={() => marcar("B")} className={`${BTN} bg-[#4C9A2A] text-white`}>Baixa registrada</button>}
                        {item.situacao !== "D" && <button type="button" disabled={salvando} onClick={() => marcar("D")} className={`${BTN} border border-[#C9D1DE] text-[#B42318] dark:text-[#FF9C92]`}>Divergente</button>}
                        {item.situacao !== "N" && <button type="button" disabled={salvando} onClick={() => marcar("N")} className={`${BTN} border border-[#C9D1DE]`}>Não é comprovante</button>}
                        {item.situacao !== "P" && item.situacao !== "A" && <button type="button" disabled={salvando} onClick={() => marcar("P")} className={`${BTN} border border-[#C9D1DE]`}>Voltar para pendente</button>}
                    </div>
                    {!contrato && item.situacao !== "B" && <p className="m-0 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Para registrar a baixa, vincule o número a um contrato.</p>}
                </div>
            </div>
        </div>
    );
}
