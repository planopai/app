"use client";

/**
 * Pacote 5B (16/10/2026): painel do cliente na conversa do WhatsApp.
 * Contrato da Unymos vinculado ao contato (titular, plano, autorização, beneficiários, mensalidades) e cobrança:
 * link Pix/cartão e Pix do lote (regra do sistema), boleto e recibo em PDF enviados pela conversa.
 * Contato que não é titular/dependente é vinculado aqui. Servidor: messenger.php (cliente_painel, contratos_buscar,
 * contato_vincular, contato_desvincular, cliente_cobrar) → messenger_unymos.php (API direta da Unymos/UnyFintech).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import type { Conversa } from "@/components/messenger/tipos";
import { Icone } from "./Lista";

type Vinculo = { id_contrato: number; contrato: string; titular: string | null; plano: string | null; relacao: string; pode_pagar: boolean; criado_por: string | null; criado_em: string };
type Parcela = { id: number; parcela: string; valor: number; vencimento: string; situacao: string; tipo: string; no_lote?: boolean };
type Painel = {
    vinculos: Vinculo[];
    atual: Vinculo | null;
    nao_encontrado?: boolean;
    contrato?: { plano: string; titular: string; data_contrato: string; cidade: string };
    autorizacao?: { autorizado: boolean; motivos: string[] } | null;
    beneficiarios?: { nome: string; tipo: string; grau?: string; idade?: number | null }[];
    copia?: { situacao: string; plano: string; cobertura: string; tags: string[]; aditivo_permite: boolean | null; atualizado_em: string } | null;
    financeiro?: { em_atraso: boolean; total_vencido: number; abertas: Parcela[]; vencidas_ids: number[]; total_lote: number; quantidade_lote: number; pagas: Parcela[] };
    notas?: { id: number; numero: string; data: string; valor: number }[];
    cobrancas?: { tipo: string; valor: number; situacao: string; por: string | null; criado_em: string; pago_em: string | null }[];
};
type Achado = { contrato: string; titular: string; plano: string; cidade: string; cpf: string };

/** PDF/imagem em base64 vira arquivo para mandar pela conversa (mesmo caminho do clipe). */
function arquivoDe(base64: string, nome: string, tipo: string): File {
    const bin = atob(base64.replace(/^data:[^,]+,/, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], nome, { type: tipo });
}
const NOME_COBRANCA: Record<string, string> = { link: "Link Pix/cartão", pix: "Pix", boleto: "Boleto", recibo: "Recibo" };

const RELACOES: [string, string][] = [["titular", "Titular"], ["dependente", "Dependente"], ["filho", "Filho(a) do titular"], ["conjuge", "Cônjuge"], ["familiar", "Familiar"], ["responsavel", "Responsável financeiro"], ["outro", "Outro"]];
const TIPOS: Record<string, string> = { T: "titular", D: "dependente", A: "agregado", P: "pet" };
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const rotulo = "text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14.5px] font-extrabold text-[#313C55] hover:bg-[#F0F2F5] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-[14.5px] font-extrabold text-white hover:bg-[#262F45] disabled:opacity-50 dark:bg-[#3D6A99]";

export default function PainelCliente({ conversa, onFechar, onInserirTexto, onEnviarArquivo }: { conversa: Conversa; onFechar: () => void; onInserirTexto: (t: string) => void; onEnviarArquivo?: (f: File) => void }) {
    const [dados, setDados] = useState<Painel | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [vincular, setVincular] = useState(false);
    const [ocupado, setOcupado] = useState("");
    const [contratoAtual, setContratoAtual] = useState("");
    const [qr, setQr] = useState("");
    const [ate, setAte] = useState(0); // antecipação: cobrar até esta parcela (0 = só as do mês)

    const carregar = useCallback(async (contrato = "", procurar = false) => {
        setErro("");
        try {
            setDados(await msgGet<Painel>("cliente_painel", { conversa_id: conversa.id, ...(contrato ? { contrato } : {}), ...(procurar ? { procurar: 1 } : {}) }));
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

    const cobrar = async (tipo: "link" | "pix" | "boleto" | "recibo", conta?: Parcela) => {
        if (!dados?.atual) return;
        if ((tipo === "boleto" || tipo === "recibo") && !window.confirm(`Gerar e enviar o ${tipo} ${conta ? `da parcela ${conta.parcela || data(conta.vencimento)} ` : ""}para o cliente agora?`)) return;
        setOcupado(tipo + (conta?.id || ""));
        setErro("");
        try {
            const r = await msgPost("cliente_cobrar", { conversa_id: conversa.id, contrato: dados.atual.contrato, tipo, conta_id: conta?.id, ...((tipo === "link" || tipo === "pix") && ate ? { ate_conta_id: ate } : {}) });
            if (r.dados.pdf_base64) {
                onEnviarArquivo?.(arquivoDe(r.dados.pdf_base64, r.dados.nome, "application/pdf"));
                setAviso(tipo === "boleto" ? "Boleto enviado ao cliente." : "Recibo enviado ao cliente.");
            } else {
                onInserirTexto(r.dados.texto);
                setQr(r.dados.qr_base64 || "");
                setAte(0);
                setAviso(tipo === "pix" ? "Código Pix colocado no campo de mensagem. Revise e envie; se quiser, mande também o QR Code abaixo." : "Link colocado no campo de mensagem. Revise e envie.");
            }
            carregar(dados.atual.contrato);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado("");
        }
    };
    const desvincular = async (v: Vinculo) => {
        if (!window.confirm(`Tirar o vínculo deste contato com o contrato ${v.contrato}?`)) return;
        try {
            await msgPost("contato_desvincular", { conversa_id: conversa.id, contrato: v.contrato });
            setContratoAtual("");
            carregar("");
        } catch (e: any) {
            setErro(e.message);
        }
    };

    const f = dados?.financeiro;
    const atual = dados?.atual;
    const aut = dados?.autorizacao;
    return (
        <div className="fixed inset-0 z-[75] flex justify-end bg-black/30" onClick={onFechar}>
            <aside role="dialog" aria-modal="true" aria-label="Cliente na Unymos" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[400px] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl dark:bg-[#232B3F] dark:text-white">
                <div className="flex items-center gap-2 border-b border-[#EEF0F3] px-4 py-3 dark:border-white/10">
                    <div className="min-w-0 flex-1"><div className={rotulo}>Cliente · Unymos</div><div className="truncate text-[17px] font-extrabold">{conversa.titulo}</div></div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F0F2F5] dark:hover:bg-white/10"><Icone nome="x" className="h-5 w-5" /></button>
                </div>
                {erro && <div className="mx-4 mt-3 rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {aviso && <div className="mx-4 mt-3 rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-3 py-2 text-[14px] font-bold text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]">{aviso}</div>}
                {qr && (
                    <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-[#E1E5EC] p-3 dark:border-white/15">
                        <img src={`data:image/png;base64,${qr.replace(/^data:[^,]+,/, "")}`} alt="QR Code do Pix" className="h-24 w-24 rounded-lg bg-white p-1" />
                        <div className="flex flex-1 flex-col gap-2"><span className="text-[13.5px]">QR Code do Pix</span>{onEnviarArquivo && <button type="button" className={btn} onClick={() => { onEnviarArquivo(arquivoDe(qr, "pix-qrcode.png", "image/png")); setQr(""); setAviso("QR Code enviado ao cliente."); }}>Enviar QR Code</button>}</div>
                    </div>
                )}
                {!dados && !erro && <p className="px-4 py-6 text-[15px]">Consultando a Unymos…</p>}

                {dados && !atual && (
                    <div className="flex flex-col gap-3 px-4 py-5">
                        <p className="text-[15px]">O telefone deste contato não foi encontrado em nenhum contrato da Unymos. Busque pelo número do contrato, CPF ou nome do titular.</p>
                        <p className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Serve também para quem não é titular nem dependente (filho, cônjuge, responsável pelo pagamento). O vínculo fica salvo para as próximas conversas.</p>
                        <button type="button" className={btnPri} onClick={() => setVincular(true)}>Vincular a um contrato</button>
                        <button type="button" className={btn} onClick={() => { setDados(null); carregar("", true); }}>Procurar o telefone de novo na Unymos</button>
                    </div>
                )}

                {dados && atual && (
                    <div className="flex flex-col gap-4 px-4 py-4">
                        {dados.vinculos.length > 1 && (
                            <label className="block"><span className={rotulo}>Contrato</span>
                                <select className="mt-1 h-11 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[15px] dark:border-white/15 dark:bg-[#1C2334]" value={atual.contrato} onChange={(e) => { setDados(null); setContratoAtual(e.target.value); }}>
                                    {dados.vinculos.map((v) => <option key={v.contrato} value={v.contrato}>{v.contrato} · {v.titular}</option>)}
                                </select>
                            </label>
                        )}
                        <div>
                            <div className="flex items-start gap-2">
                                <b className="flex-1 text-[18px]">Contrato {atual.contrato}{dados.copia?.plano || dados.contrato?.plano || atual.plano ? ` · ${dados.copia?.plano || dados.contrato?.plano || atual.plano}` : ""}</b>
                                {dados.copia?.situacao && <span className={`mt-0.5 flex-none rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${/ATIV/i.test(dados.copia.situacao) ? "bg-[#EEF5D6] text-[#2F4207]" : "bg-[#FDECEA] text-[#B42318]"}`}>{dados.copia.situacao}</span>}
                            </div>
                            {dados.copia?.cobertura && <div className="text-[14px] text-[#4A5468] dark:text-[#C9D1DE]">Cobertura: {dados.copia.cobertura}</div>}
                            {dados.copia && dados.copia.aditivo_permite !== null && <div className="text-[13.5px] text-[#4A5468] dark:text-[#C9D1DE]">{dados.copia.aditivo_permite ? "Aceita aditivo (Tanatopraxia / Translado)" : "Não aceita aditivo"}</div>}
                            {(dados.copia?.tags || []).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">{dados.copia!.tags.map((t) => <span key={t} className="rounded-full border border-dashed border-[#9AA3B5] px-2 py-0.5 text-[12px] font-bold dark:border-white/30">Unymos · {t}</span>)}</div>
                            )}
                            {!dados.copia && <div className="text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">Situação e etiquetas aparecem depois da cópia diária dos contratos (Configurações › Geral).</div>}
                            <div className="text-[14.5px] text-[#4A5468] dark:text-[#C9D1DE]">Titular: {dados.contrato?.titular || atual.titular || "—"}{dados.contrato?.data_contrato ? ` · desde ${data(dados.contrato.data_contrato)}` : ""}</div>
                            {dados.nao_encontrado && <p className="mt-1 text-[14px] font-bold text-[#B42318] dark:text-[#FF9C92]">Contrato não encontrado agora na Unymos.</p>}
                            {aut && (
                                <div className={`mt-2 rounded-xl px-3 py-2 text-[14px] font-bold ${aut.autorizado ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]" : "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"}`}>
                                    {aut.autorizado ? "✓ Beneficiário autorizado" : `✕ Não autorizado${aut.motivos.length ? `: ${aut.motivos.join("; ")}` : ""}`}
                                </div>
                            )}
                            <div className="mt-2 rounded-xl bg-[#E9EFF6] px-3 py-2 text-[13.5px] dark:bg-[#3D6A99]/25">
                                <b>Este contato:</b> {RELACOES.find(([k]) => k === atual.relacao)?.[1] || atual.relacao}{atual.pode_pagar ? " · pode receber cobranças" : " · não recebe cobranças"}{atual.criado_por ? ` · vinculado por ${atual.criado_por}` : " · vinculado pelo telefone"}
                                <div className="mt-1 flex gap-3"><button type="button" className="font-extrabold text-[#3D6A99] underline dark:text-[#A9BED6]" onClick={() => setVincular(true)}>Vincular outro contrato</button><button type="button" className="font-extrabold text-[#B42318] underline dark:text-[#FF9C92]" onClick={() => desvincular(atual)}>Tirar vínculo</button></div>
                            </div>
                        </div>

                        {f && (
                            <section>
                                <div className={rotulo}>Mensalidades em aberto</div>
                                {f.em_atraso && <div className="mt-1 rounded-lg bg-[#FDECEA] px-3 py-1.5 text-[14px] font-extrabold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">Em atraso: {reais(f.total_vencido)}</div>}
                                <div className="mt-1 flex flex-col">
                                    {f.abertas.map((p, i) => {
                                        const vencida = f.vencidas_ids.includes(p.id);
                                        const posAte = ate ? f.abertas.findIndex((x) => x.id === ate) : -1;
                                        const antecipada = !p.no_lote && posAte >= i;
                                        return (
                                            <div key={p.id} className="flex items-center gap-2 border-b border-[#F0F2F5] py-2 text-[15px] last:border-0 dark:border-white/10">
                                                {!p.no_lote && atual.pode_pagar && <input type="checkbox" className="h-5 w-5 flex-none accent-[#313C55]" checked={antecipada} onChange={() => setAte(antecipada ? (i > 0 && !f.abertas[i - 1].no_lote ? f.abertas[i - 1].id : 0) : p.id)} aria-label={`Antecipar a parcela ${p.parcela || data(p.vencimento)}`} title="Antecipar (entra no link e no Pix)" />}
                                                <span className={`flex-1 ${vencida ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}><b>{p.parcela || "Mensalidade"}</b> · {vencida ? "venceu" : "vence"} {data(p.vencimento)}{antecipada ? <span className="ml-1 text-[12px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">antecipar</span> : null}</span>
                                                <b>{reais(p.valor)}</b>
                                                {p.no_lote && <span title="Entra no link e no Pix" className="text-[#4C9A2A]">●</span>}
                                                {atual.pode_pagar && <button type="button" title="Enviar boleto desta parcela" aria-label={`Enviar boleto da parcela ${p.parcela}`} disabled={!!ocupado} onClick={() => cobrar("boleto", p)} className="rounded-lg border border-[#C9D1DE] px-2 py-0.5 text-[12px] font-extrabold disabled:opacity-50 dark:border-white/25">{ocupado === `boleto${p.id}` ? "…" : "Boleto"}</button>}
                                            </div>
                                        );
                                    })}
                                    {!f.abertas.length && <p className="py-2 text-[14.5px] text-[#4C9A2A]">Nenhuma mensalidade em aberto.</p>}
                                </div>
                                {f.quantidade_lote > 0 && atual.pode_pagar && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" className={btnPri} disabled={!!ocupado} onClick={() => cobrar("link")}>{ocupado === "link" ? "Gerando…" : "Link Pix/cartão"}</button>
                                            <button type="button" className={btnPri} disabled={!!ocupado} onClick={() => cobrar("pix")}>{ocupado === "pix" ? "Gerando…" : "Pix copia e cola"}</button>
                                        </div>
                                        <p className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Link e Pix de <b>{reais(f.total_lote + (ate ? f.abertas.filter((x, i) => !x.no_lote && i <= f.abertas.findIndex((y) => y.id === ate)).reduce((t, x) => t + x.valor, 0) : 0))}</b>: as parcelas com ● (da mais antiga até a do mês), como no sistema{ate ? ", mais as marcadas para antecipar" : ". Para antecipar, marque as próximas parcelas"}. O texto vai para o campo de mensagem para você revisar.</p>
                                    </div>
                                )}
                                {f.pagas.length > 0 && (
                                    <div className="mt-3">
                                        <div className={rotulo}>Últimas pagas</div>
                                        {f.pagas.map((p) => (
                                            <div key={p.id} className="flex items-center gap-2 py-1.5 text-[14.5px]">
                                                <span className="flex-1">{p.parcela || "Mensalidade"} · {data(p.vencimento)}</span><span>{reais(p.valor)}</span>
                                                <button type="button" disabled={!!ocupado} onClick={() => cobrar("recibo", p)} className="rounded-lg border border-[#C9D1DE] px-2 py-0.5 text-[12px] font-extrabold disabled:opacity-50 dark:border-white/25">{ocupado === `recibo${p.id}` ? "…" : "Recibo"}</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {(dados.cobrancas || []).length > 0 && (
                            <section>
                                <div className={rotulo}>Cobranças nesta conversa</div>
                                {dados.cobrancas!.map((c, i) => (
                                    <div key={i} className="py-1 text-[14px]">{NOME_COBRANCA[c.tipo] || c.tipo} · {reais(c.valor)}{c.tipo === "pix" ? (c.situacao === "F" ? " · ✅ pago" : c.situacao === "C" ? " · cancelado" : " · aguardando pagamento") : ""}{c.por ? ` · ${c.por}` : ""}</div>
                                ))}
                            </section>
                        )}
                        {(dados.beneficiarios || []).length > 0 && (
                            <section>
                                <div className={rotulo}>Beneficiários</div>
                                {dados.beneficiarios!.map((b, i) => <div key={i} className="py-1 text-[15px]">{b.tipo === "P" ? "🐾" : "👤"} {b.nome} <span className="text-[#6B7488] dark:text-[#AEB9CF]">· {[b.grau ? b.grau.toLowerCase() : TIPOS[b.tipo] || b.tipo || "", b.idade !== null && b.idade !== undefined && b.tipo !== "P" ? `${b.idade} anos` : ""].filter(Boolean).join(" · ") || "—"}</span></div>)}
                            </section>
                        )}
                        <button type="button" className={btn} onClick={() => { setDados(null); carregar(atual.contrato); }}>Atualizar dados</button>
                    </div>
                )}
            </aside>
            {vincular && <VincularContrato conversa={conversa} onFechar={() => setVincular(false)} onFeito={(n) => { setVincular(false); setAviso("Contato vinculado ao contrato."); setDados(null); setContratoAtual(n); carregar(n); }} />}
        </div>
    );
}

function VincularContrato({ conversa, onFechar, onFeito }: { conversa: Conversa; onFechar: () => void; onFeito: (contrato: string) => void }) {
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
            await msgPost("contato_vincular", { conversa_id: conversa.id, contrato: escolhido.contrato, relacao, pode_pagar: podePagar });
            onFeito(escolhido.contrato);
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
                    <input className="h-12 min-w-0 flex-1 rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[16px] dark:border-white/15 dark:bg-[#1C2334]" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Nº do contrato, CPF ou nome do titular" aria-label="Buscar contrato" autoFocus />
                    <button type="button" className={btnPri} disabled={ocupado || q.trim().length < 3} onClick={buscar}>{ocupado && !achados ? "Buscando…" : "Buscar"}</button>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {achados && !achados.length && <p className="text-[14.5px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhum contrato encontrado.</p>}
                <div className="flex flex-col gap-2">
                    {(achados || []).map((a) => (
                        <button key={a.contrato} type="button" onClick={() => setEscolhido(a)} aria-pressed={escolhido?.contrato === a.contrato} className={`rounded-2xl border px-3 py-2.5 text-left ${escolhido?.contrato === a.contrato ? "border-2 border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "border-[#E1E5EC] dark:border-white/15"}`}>
                            <b className="block text-[16px]">Contrato {a.contrato}{a.plano ? ` · ${a.plano}` : ""}</b>
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
                    <button type="button" className={btnPri} disabled={!escolhido || ocupado} onClick={salvar}>{escolhido ? `Vincular ao contrato ${escolhido.contrato}` : "Vincular"}</button>
                </div>
            </div>
        </div>
    );
}
