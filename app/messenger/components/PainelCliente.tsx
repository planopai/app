"use client";

/**
 * Pacote 5B (16/10/2026): painel do cliente na conversa do WhatsApp.
 * Mostra o contrato da Unymos vinculado ao contato (titular, plano, beneficiários, parcelas) e gera o link de
 * pagamento do lote liberado (regra do associados_geral.php). Contato que não é titular/dependente é vinculado aqui.
 * Servidor: messenger.php (cliente_painel, contratos_buscar, contato_vincular, contato_desvincular, cliente_link_pagamento).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import type { Conversa } from "@/components/messenger/tipos";
import { Icone } from "./Lista";

type Vinculo = { id_contrato: number; contrato: string | null; titular: string | null; plano: string | null; relacao: string; pode_pagar: boolean; criado_por: string | null; criado_em: string };
type Parcela = { id: number; parcela: string; valor: number; vencimento: string; pode_pagar_agora: boolean };
type Painel = {
    vinculos: Vinculo[];
    atual: Vinculo | null;
    contrato?: { situacao: string; plano: string; cobertura: string; etiquetas: string[]; ultimo_pagamento: string };
    beneficiarios?: { nome: string; tipo: string }[];
    financeiro?: { em_atraso?: boolean; total_vencido?: number; vencidas?: Parcela[]; pendentes?: Parcela[]; liberadas?: Parcela[]; total_liberado?: number; conta_liberada_id?: number; erro?: string };
};
type Achado = { id_contrato: number; contrato: string; titular: string; plano: string; situacao: string; cidade: string; cpf: string };

const RELACOES: [string, string][] = [["titular", "Titular"], ["dependente", "Dependente"], ["filho", "Filho(a) do titular"], ["conjuge", "Cônjuge"], ["familiar", "Familiar"], ["responsavel", "Responsável financeiro"], ["outro", "Outro"]];
const TIPOS: Record<string, string> = { T: "titular", D: "dependente", A: "agregado", P: "pet" };
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const rotulo = "text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14.5px] font-extrabold text-[#313C55] hover:bg-[#F0F2F5] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-[14.5px] font-extrabold text-white hover:bg-[#262F45] disabled:opacity-50 dark:bg-[#3D6A99]";

export default function PainelCliente({ conversa, onFechar, onInserirTexto }: { conversa: Conversa; onFechar: () => void; onInserirTexto: (t: string) => void }) {
    const [dados, setDados] = useState<Painel | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [vincular, setVincular] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [contratoAtual, setContratoAtual] = useState(0);

    const carregar = useCallback(async (idContrato = 0) => {
        setErro("");
        try {
            setDados(await msgGet<Painel>("cliente_painel", { conversa_id: conversa.id, ...(idContrato ? { id_contrato: idContrato } : {}) }));
        } catch (e: any) {
            setErro(e.message);
        }
    }, [conversa.id]);
    useEffect(() => {
        carregar(contratoAtual);
    }, [carregar, contratoAtual]);
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && !vincular && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar, vincular]);

    const gerarLink = async () => {
        const f = dados?.financeiro;
        if (!dados?.atual || !f?.conta_liberada_id) return;
        setGerando(true);
        try {
            const r = await msgPost("cliente_link_pagamento", { conversa_id: conversa.id, id_contrato: dados.atual.id_contrato, conta_id: f.conta_liberada_id });
            onInserirTexto(r.dados.texto);
            setAviso("Link gerado e colocado no campo de mensagem. Revise e envie.");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setGerando(false);
        }
    };
    const desvincular = async (v: Vinculo) => {
        if (!window.confirm(`Tirar o vínculo deste contato com o contrato ${v.contrato || v.id_contrato}?`)) return;
        try {
            await msgPost("contato_desvincular", { conversa_id: conversa.id, id_contrato: v.id_contrato });
            setContratoAtual(0);
            carregar(0);
        } catch (e: any) {
            setErro(e.message);
        }
    };

    const f = dados?.financeiro;
    const atual = dados?.atual;
    return (
        <div className="fixed inset-0 z-[75] flex justify-end bg-black/30" onClick={onFechar}>
            <aside role="dialog" aria-modal="true" aria-label="Cliente na Unymos" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[400px] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl dark:bg-[#232B3F] dark:text-white">
                <div className="flex items-center gap-2 border-b border-[#EEF0F3] px-4 py-3 dark:border-white/10">
                    <div className="min-w-0 flex-1"><div className={rotulo}>Cliente · Unymos</div><div className="truncate text-[17px] font-extrabold">{conversa.titulo}</div></div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F0F2F5] dark:hover:bg-white/10"><Icone nome="x" className="h-5 w-5" /></button>
                </div>
                {erro && <div className="mx-4 mt-3 rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {aviso && <div className="mx-4 mt-3 rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-3 py-2 text-[14px] font-bold text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]">{aviso}</div>}
                {!dados && !erro && <p className="px-4 py-6 text-[15px]">Consultando a Unymos…</p>}

                {dados && !atual && (
                    <div className="flex flex-col gap-3 px-4 py-5">
                        <p className="text-[15px]">Este contato ainda não está ligado a um contrato. Busque pelo número do contrato ou pelo nome do titular.</p>
                        <p className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Serve também para quem não é titular nem dependente (filho, cônjuge, responsável pelo pagamento). O vínculo fica salvo para as próximas conversas.</p>
                        <button type="button" className={btnPri} onClick={() => setVincular(true)}>Vincular a um contrato</button>
                    </div>
                )}

                {dados && atual && (
                    <div className="flex flex-col gap-4 px-4 py-4">
                        {dados.vinculos.length > 1 && (
                            <label className="block"><span className={rotulo}>Contrato</span>
                                <select className="mt-1 h-11 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[15px] dark:border-white/15 dark:bg-[#1C2334]" value={atual.id_contrato} onChange={(e) => { setDados(null); setContratoAtual(Number(e.target.value)); }}>
                                    {dados.vinculos.map((v) => <option key={v.id_contrato} value={v.id_contrato}>{v.contrato || v.id_contrato} · {v.titular}</option>)}
                                </select>
                            </label>
                        )}
                        <div>
                            <div className="flex items-center gap-2"><b className="flex-1 text-[18px]">Contrato {atual.contrato || atual.id_contrato}{dados.contrato?.plano ? ` · ${dados.contrato.plano}` : ""}</b>{dados.contrato?.situacao && <span className={`rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${/ATIVO/i.test(dados.contrato.situacao) ? "bg-[#EEF5D6] text-[#2F4207]" : "bg-[#FDECEA] text-[#B42318]"}`}>{dados.contrato.situacao}</span>}</div>
                            <div className="text-[14.5px] text-[#4A5468] dark:text-[#C9D1DE]">Titular: {atual.titular || "—"}</div>
                            {(dados.contrato?.etiquetas || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{dados.contrato!.etiquetas.map((t) => <span key={t} className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[12px] font-extrabold dark:bg-white/10">{t}</span>)}</div>}
                            <div className="mt-2 rounded-xl bg-[#E9EFF6] px-3 py-2 text-[13.5px] dark:bg-[#3D6A99]/25">
                                <b>Este contato:</b> {RELACOES.find(([k]) => k === atual.relacao)?.[1] || atual.relacao}{atual.pode_pagar ? " · pode receber cobranças" : " · não recebe cobranças"}{atual.criado_por ? ` · vinculado por ${atual.criado_por}` : ""}
                                <div className="mt-1 flex gap-3"><button type="button" className="font-extrabold text-[#3D6A99] underline dark:text-[#A9BED6]" onClick={() => setVincular(true)}>Vincular outro contrato</button><button type="button" className="font-extrabold text-[#B42318] underline dark:text-[#FF9C92]" onClick={() => desvincular(atual)}>Tirar vínculo</button></div>
                            </div>
                        </div>

                        <section>
                            <div className={rotulo}>Parcelas</div>
                            {f?.erro && <p className="mt-1 text-[14px] text-[#B42318] dark:text-[#FF9C92]">{f.erro}</p>}
                            {f && !f.erro && (
                                <>
                                    {f.em_atraso && <div className="mt-1 rounded-lg bg-[#FDECEA] px-3 py-1.5 text-[14px] font-extrabold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">Em atraso: {reais(f.total_vencido || 0)}</div>}
                                    <div className="mt-1 flex flex-col">
                                        {[...(f.vencidas || []), ...(f.pendentes || []).filter((p) => !(f.vencidas || []).some((v) => v.id === p.id))].map((p) => {
                                            const vencida = (f.vencidas || []).some((v) => v.id === p.id);
                                            return (
                                                <div key={p.id} className="flex items-center gap-2 border-b border-[#F0F2F5] py-2 text-[15px] last:border-0 dark:border-white/10">
                                                    <span className={`flex-1 ${vencida ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}><b>{p.parcela || "Mensalidade"}</b> · {vencida ? "venceu" : "vence"} {data(p.vencimento)}</span>
                                                    <b>{reais(p.valor)}</b>
                                                    {p.pode_pagar_agora && <span title="Entra no link de pagamento" className="text-[#4C9A2A]">●</span>}
                                                </div>
                                            );
                                        })}
                                        {!(f.vencidas || []).length && !(f.pendentes || []).length && <p className="py-2 text-[14.5px] text-[#4C9A2A]">Nenhuma parcela em aberto.</p>}
                                    </div>
                                    {!!f.conta_liberada_id && (
                                        <div className="mt-2 flex flex-col gap-1.5">
                                            <button type="button" className={btnPri} disabled={gerando || !atual.pode_pagar} onClick={gerarLink}>{gerando ? "Gerando…" : `Gerar link Pix/cartão · ${reais(f.total_liberado || 0)}`}</button>
                                            <p className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Pela regra da Unymos, o link junta as parcelas marcadas com ● (da mais antiga até a do mês). Ele vai para o campo de mensagem para você revisar antes de enviar.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        {(dados.beneficiarios || []).length > 0 && (
                            <section>
                                <div className={rotulo}>Beneficiários</div>
                                {dados.beneficiarios!.map((b, i) => <div key={i} className="py-1 text-[15px]">👤 {b.nome} <span className="text-[#6B7488] dark:text-[#AEB9CF]">· {TIPOS[b.tipo] || b.tipo || "—"}</span></div>)}
                            </section>
                        )}
                        {dados.contrato?.ultimo_pagamento && <div className="text-[14px]"><span className={rotulo}>Último pagamento</span><div>{data(dados.contrato.ultimo_pagamento.slice(0, 10))}</div></div>}
                        <button type="button" className={btn} onClick={() => { setDados(null); carregar(atual.id_contrato); }}>Atualizar dados</button>
                    </div>
                )}
            </aside>
            {vincular && <VincularContrato conversa={conversa} onFechar={() => setVincular(false)} onFeito={(id) => { setVincular(false); setAviso("Contato vinculado ao contrato."); setDados(null); setContratoAtual(id); carregar(id); }} />}
        </div>
    );
}

function VincularContrato({ conversa, onFechar, onFeito }: { conversa: Conversa; onFechar: () => void; onFeito: (idContrato: number) => void }) {
    const [q, setQ] = useState("");
    const [achados, setAchados] = useState<Achado[] | null>(null);
    const [escolhido, setEscolhido] = useState<Achado | null>(null);
    const [relacao, setRelacao] = useState("filho");
    const [podePagar, setPodePagar] = useState(true);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const buscar = async () => {
        if (q.trim().length < 3) return;
        setOcupado(true);
        setErro("");
        try {
            const r = await msgGet<Achado[]>("contratos_buscar", { q: q.trim() });
            setAchados(r);
            setEscolhido(r.length === 1 ? r[0] : null);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(false);
        }
    };
    const salvar = async () => {
        if (!escolhido) return;
        setOcupado(true);
        try {
            await msgPost("contato_vincular", { conversa_id: conversa.id, id_contrato: escolhido.id_contrato, relacao, pode_pagar: podePagar, contrato: escolhido.contrato, titular: escolhido.titular, plano: escolhido.plano });
            onFeito(escolhido.id_contrato);
        } catch (e: any) {
            setErro(e.message);
            setOcupado(false);
        }
    };
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={(e) => { e.stopPropagation(); onFechar(); }}>
            <div role="dialog" aria-modal="true" aria-label="Vincular contato a um contrato" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[600px] flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[#1F2638] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white">
                <div><h2 className="m-0 text-xl font-extrabold text-[#313C55] dark:text-white">Vincular contato a um contrato</h2><p className="mt-1 text-[14.5px] text-[#5B6478] dark:text-[#AEB9CF]">{conversa.titulo}{conversa.contato?.telefone ? ` · ${conversa.contato.telefone}` : ""}</p></div>
                <div className="flex gap-2">
                    <input className="h-12 min-w-0 flex-1 rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[16px] dark:border-white/15 dark:bg-[#1C2334]" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Nº do contrato ou nome do titular" aria-label="Buscar contrato" autoFocus />
                    <button type="button" className={btnPri} disabled={ocupado || q.trim().length < 3} onClick={buscar}>{ocupado && !achados ? "Buscando…" : "Buscar"}</button>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {achados && !achados.length && <p className="text-[14.5px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhum contrato encontrado.</p>}
                <div className="flex flex-col gap-2">
                    {(achados || []).map((a) => (
                        <button key={a.id_contrato} type="button" onClick={() => setEscolhido(a)} aria-pressed={escolhido?.id_contrato === a.id_contrato} className={`rounded-2xl border px-3 py-2.5 text-left ${escolhido?.id_contrato === a.id_contrato ? "border-2 border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "border-[#E1E5EC] dark:border-white/15"}`}>
                            <div className="flex items-center gap-2"><b className="flex-1 text-[16px]">Contrato {a.contrato || a.id_contrato}{a.plano ? ` · ${a.plano}` : ""}</b><span className="text-[12px] font-extrabold">{a.situacao}</span></div>
                            <div className="text-[14px] text-[#4A5468] dark:text-[#C9D1DE]">Titular: {a.titular}{a.cpf ? ` · CPF ${a.cpf}` : ""}{a.cidade ? ` · ${a.cidade}` : ""}</div>
                        </button>
                    ))}
                </div>
                {escolhido && (
                    <>
                        <label className="block"><span className={rotulo}>Este contato é…</span>
                            <select className="mt-1 h-12 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[16px] dark:border-white/15 dark:bg-[#1C2334]" value={relacao} onChange={(e) => setRelacao(e.target.value)}>{RELACOES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                        </label>
                        <label className="flex items-center gap-2 text-[15px] font-bold"><input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={podePagar} onChange={(e) => setPodePagar(e.target.checked)} />Pode receber link de pagamento e cobranças deste contrato</label>
                    </>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" className={btn} onClick={onFechar}>Cancelar</button>
                    <button type="button" className={btnPri} disabled={!escolhido || ocupado} onClick={salvar}>{escolhido ? `Vincular ao contrato ${escolhido.contrato || escolhido.id_contrato}` : "Vincular"}</button>
                </div>
            </div>
        </div>
    );
}
