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
import TipoContato from "./TipoContato";

type Vinculo = { id_contrato: number; contrato: string; titular: string | null; plano: string | null; relacao: string; pode_pagar: boolean; criado_por: string | null; criado_em: string };
type Parcela = { id: number; parcela: string; valor: number; vencimento: string; situacao: string; tipo: string; no_lote?: boolean; pago_em?: string; forma?: string };
type Tag = { nome: string; cor: string | null };
type Painel = {
    vinculos: Vinculo[];
    atual: Vinculo | null;
    nao_encontrado?: boolean;
    contrato?: { plano: string; titular: string; data_contrato: string; cidade: string };
    autorizacao?: { autorizado: boolean; motivos: string[] } | null;
    beneficiarios?: { nome: string; tipo: string; grau?: string; idade?: number | null }[];
    copia?: { situacao: string; plano: string; plano_curto: string; cobertura: string; tags: Tag[]; aditivo_permite: boolean | null; atualizado_em: string } | null;
    financeiro?: { em_atraso: boolean; total_vencido: number; abertas: Parcela[]; vencidas_ids: number[]; total_lote: number; quantidade_lote: number; pagas: Parcela[]; proxima: Parcela | null; ultima_paga: Parcela | null; pago_ano: number; pagas_ano: number };
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
const NOME_COBRANCA: Record<string, string> = { link: "Link de Pagamento", pix: "Pix", boleto: "Boleto", recibo: "Recibo" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (d: string) => (/^\d{4}-\d{2}/.test(d) ? `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}` : "");
const numParcela = (p: Parcela) => (/^\d+$/.test(p.parcela) ? String(Number(p.parcela)) : p.parcela || "");

/** Selo de etiqueta com a cor da Unymos (texto claro ou escuro conforme o fundo). */
export function SeloUnymos({ t, pequeno = false }: { t: Tag; pequeno?: boolean }) {
    const cor = t.cor || "#E1E5EC";
    const h = cor.replace("#", "");
    const claro = h.length === 6 ? (parseInt(h.slice(0, 2), 16) * 299 + parseInt(h.slice(2, 4), 16) * 587 + parseInt(h.slice(4, 6), 16) * 114) / 1000 > 150 : true;
    return <span title="Etiqueta do contrato na Unymos" className={`inline-flex flex-none items-center rounded-full px-2 font-extrabold ${pequeno ? "h-5 text-[11.5px]" : "h-6 text-[12px]"}`} style={{ background: cor, color: claro ? "#1F2638" : "#FFFFFF" }}>{t.nome}</span>;
}

const RELACOES: [string, string][] = [["titular", "Titular"], ["dependente", "Dependente"], ["filho", "Filho(a) do titular"], ["conjuge", "Cônjuge"], ["familiar", "Familiar"], ["responsavel", "Responsável financeiro"], ["outro", "Outro"]];
const TIPOS: Record<string, string> = { T: "titular", D: "dependente", A: "agregado", P: "pet" };
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const rotulo = "text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14.5px] font-extrabold text-[#313C55] hover:bg-[#F0F2F5] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-[14.5px] font-extrabold text-white hover:bg-[#262F45] disabled:opacity-50 dark:bg-[#3D6A99]";

export default function PainelCliente({ conversa, coluna = false, onFechar, onInserirTexto, onEnviarArquivo }: { conversa: Conversa; coluna?: boolean; onFechar: () => void; onInserirTexto: (t: string) => void; onEnviarArquivo?: (f: File) => void }) {
    const [dados, setDados] = useState<Painel | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [vincular, setVincular] = useState(false);
    const [historico, setHistorico] = useState(false);
    const [ocupado, setOcupado] = useState("");
    const [contratoAtual, setContratoAtual] = useState("");
    const [qr, setQr] = useState("");
    const [ate, setAte] = useState(0); // antecipação: cobrar até esta parcela (0 = só as do mês)
    const [aberta, setAberta] = useState<"" | "mensalidades" | "beneficiarios" | "cobrancas">(""); // abre tudo recolhido
    const [verTodas, setVerTodas] = useState(false);

    const carregar = useCallback(async (contrato = "", procurar = false) => {
        setErro("");
        try {
            setDados(await msgGet<Painel>("cliente_painel", { conversa_id: conversa.id, ...(contrato ? { contrato } : {}), ...(procurar ? { procurar: 1 } : {}) }));
        } catch (e: any) {
            setErro(e.message);
        }
    }, [conversa.id]);
    useEffect(() => {
        setDados(null);
        setAte(0);
        setAberta("");
        carregar(contratoAtual);
    }, [carregar, contratoAtual]);
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && !vincular && !historico && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar, vincular, historico]);

    const f = dados?.financeiro;
    const atual = dados?.atual;
    const aut = dados?.autorizacao;
    const posAte = ate && f ? f.abertas.findIndex((x) => x.id === ate) : -1;
    const marcadas = f ? f.abertas.filter((x, i) => x.no_lote || (posAte >= 0 && i <= posAte)) : [];
    const antecipadas = marcadas.filter((x) => !x.no_lote).length;
    const total = marcadas.reduce((t, x) => t + x.valor, 0);

    const cobrar = async (tipo: "link" | "pix" | "boleto" | "recibo", conta?: Parcela) => {
        if (!dados?.atual) return;
        if ((tipo === "boleto" || tipo === "recibo") && !window.confirm(`Gerar e enviar o ${tipo} ${conta ? `da parcela ${numParcela(conta)} (${mesAno(conta.vencimento)}) ` : ""}para o cliente agora?`)) return;
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
                setAviso(tipo === "pix" ? "Código Pix colocado no campo de mensagem. Revise e envie; se quiser, mande também o QR Code." : "Link colocado no campo de mensagem. Revise e envie.");
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
    const alternar = (s: "mensalidades" | "beneficiarios" | "cobrancas") => setAberta((a) => (a === s ? "" : s));
    const secao = (id: "mensalidades" | "beneficiarios" | "cobrancas", titulo: string, qtd: number, children: React.ReactNode) => (
        <section className="border-t border-[#EEF0F3] dark:border-white/10">
            <button type="button" onClick={() => alternar(id)} aria-expanded={aberta === id} className="flex w-full items-center gap-2 py-3 text-left">
                <span className={`${rotulo} flex-1`}>{titulo} · {qtd}</span>
                <span className="text-[13px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{aberta === id ? "fechar ▾" : "abrir ▸"}</span>
            </button>
            {aberta === id && <div className="pb-3">{children}</div>}
        </section>
    );
    const plano = dados?.copia?.plano_curto || (atual?.plano || "").replace(/^PLANO\s+/i, "");
    const visiveis = f ? (verTodas ? f.abertas : f.abertas.slice(0, Math.max(f.quantidade_lote + 3, posAte + 2))) : [];

    const conteudo = (
        <>
            <div className="flex items-center gap-2 border-b border-[#EEF0F3] px-4 py-3 dark:border-white/10">
                <div className="min-w-0 flex-1"><div className={rotulo}>Cliente · Unymos</div><div className="truncate text-[16px] font-extrabold">{conversa.titulo}</div></div>
                <button type="button" onClick={onFechar} aria-label="Fechar o painel do cliente" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F0F2F5] dark:hover:bg-white/10"><Icone nome="x" className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
                {erro && <div className="mt-3 rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {aviso && <div className="mt-3 rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-3 py-2 text-[14px] font-bold text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]">{aviso}</div>}
                {qr && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#E1E5EC] p-3 dark:border-white/15">
                        <img src={`data:image/png;base64,${qr.replace(/^data:[^,]+,/, "")}`} alt="QR Code do Pix" className="h-24 w-24 rounded-lg bg-white p-1" />
                        <div className="flex flex-1 flex-col gap-2"><span className="text-[13.5px]">QR Code do Pix</span>{onEnviarArquivo && <button type="button" className={btn} onClick={() => { onEnviarArquivo(arquivoDe(qr, "pix-qrcode.png", "image/png")); setQr(""); setAviso("QR Code enviado ao cliente."); }}>Enviar QR Code</button>}</div>
                    </div>
                )}
                <TipoContato conversa={conversa} />
                {!dados && !erro && <p className="py-6 text-[15px]">Consultando a Unymos…</p>}

                {dados && !atual && (
                    <div className="flex flex-col gap-3 py-5">
                        <p className="text-[15px]">O telefone deste contato não foi encontrado em nenhum contrato da Unymos. Busque pelo número do contrato, CPF ou nome do titular.</p>
                        <p className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">Serve também para quem não é titular nem dependente (filho, cônjuge, responsável pelo pagamento). O vínculo fica salvo para as próximas conversas.</p>
                        <button type="button" className={btnPri} onClick={() => setVincular(true)}>Vincular a um contrato</button>
                        <button type="button" className={btn} onClick={() => { setDados(null); carregar("", true); }}>Procurar o telefone de novo na Unymos</button>
                    </div>
                )}

                {dados && atual && (
                    <>
                        <div className="py-3">
                            {dados.vinculos.length > 1 && (
                                <select aria-label="Contrato" className="mb-2 h-10 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[14.5px] dark:border-white/15 dark:bg-[#1C2334]" value={atual.contrato} onChange={(e) => setContratoAtual(e.target.value)}>
                                    {dados.vinculos.map((v) => <option key={v.contrato} value={v.contrato}>Contrato {v.contrato} · {v.titular}</option>)}
                                </select>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                <b className="text-[19px]">Contrato {atual.contrato}</b>
                                {plano && <SeloUnymos t={dados.copia?.tags.find((t) => t.nome.toUpperCase() === plano.toUpperCase()) || { nome: plano, cor: "#313C55" }} />}
                                <span className="flex-1" />
                                {dados.copia?.situacao && <span className={`rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${/ATIV/i.test(dados.copia.situacao) ? "bg-[#EEF5D6] text-[#2F4207]" : "bg-[#FDECEA] text-[#B42318]"}`}>{dados.copia.situacao}</span>}
                            </div>
                            <div className="mt-0.5 text-[14px] text-[#4A5468] dark:text-[#C9D1DE]">Titular: {dados.contrato?.titular || atual.titular || "—"}{dados.contrato?.data_contrato ? ` · desde ${data(dados.contrato.data_contrato)}` : ""}</div>
                            {(dados.copia?.tags || []).filter((t) => t.nome.toUpperCase() !== plano.toUpperCase()).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">{dados.copia!.tags.filter((t) => t.nome.toUpperCase() !== plano.toUpperCase()).map((t) => <SeloUnymos key={t.nome} t={t} pequeno />)}</div>
                            )}
                            {!dados.copia && <div className="mt-1 text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">Situação e etiquetas aparecem depois da cópia diária dos contratos (Configurações › Geral).</div>}
                            {dados.nao_encontrado && <p className="mt-1 text-[14px] font-bold text-[#B42318] dark:text-[#FF9C92]">Contrato não encontrado agora na Unymos.</p>}

                            {f && (
                                <div className="mt-3 grid grid-cols-3 gap-1.5">
                                    <div className={`rounded-xl px-2.5 py-2 ${f.em_atraso ? "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]" : "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]"}`}>
                                        <div className="text-[11px] font-extrabold uppercase">Situação</div>
                                        <div className="text-[14.5px] font-extrabold">{f.em_atraso ? `Atraso ${reais(f.total_vencido)}` : "✓ Em dia"}</div>
                                    </div>
                                    <div className="rounded-xl bg-[#F0F2F5] px-2.5 py-2 dark:bg-white/10">
                                        <div className="text-[11px] font-extrabold uppercase text-[#5B6478] dark:text-[#AEB9CF]">Próxima</div>
                                        <div className="text-[14.5px] font-extrabold">{f.proxima ? `${data(f.proxima.vencimento).slice(0, 5)} · ${reais(f.proxima.valor).replace(",00", "")}` : "—"}</div>
                                    </div>
                                    <button type="button" onClick={() => setHistorico(true)} className="rounded-xl border border-[#3D6A99] bg-[#E9EFF6] px-2.5 py-2 text-left text-[#1E3A5C] hover:bg-[#DDE7F3] dark:bg-[#3D6A99]/25 dark:text-[#DDE7F3]">
                                        <div className="text-[11px] font-extrabold uppercase">Pagamentos</div>
                                        <div className="text-[14.5px] font-extrabold">Histórico ›</div>
                                    </button>
                                </div>
                            )}
                            <div className="mt-2 text-[13px] font-bold">
                                {aut && <span className={aut.autorizado ? "text-[#2F4207] dark:text-[#DCEBAA]" : "text-[#B42318] dark:text-[#FF9C92]"}>{aut.autorizado ? "✓ Beneficiário autorizado" : `✕ Não autorizado${aut.motivos.length ? `: ${aut.motivos.join("; ")}` : ""}`}</span>}
                                <span className="text-[#4A5468] dark:text-[#C9D1DE]">{aut ? " · " : ""}contato: {RELACOES.find(([k]) => k === atual.relacao)?.[1]?.toLowerCase() || atual.relacao}{atual.criado_por ? `, vinculado por ${atual.criado_por}` : ", vinculado pelo telefone"}{atual.pode_pagar ? "" : ", não recebe cobranças"} · </span>
                                <button type="button" className="text-[#3D6A99] underline dark:text-[#A9BED6]" onClick={() => setVincular(true)}>trocar</button>
                                <span className="text-[#4A5468]"> · </span>
                                <button type="button" className="text-[#B42318] underline dark:text-[#FF9C92]" onClick={() => desvincular(atual)}>tirar</button>
                            </div>
                        </div>

                        {f && (
                            secao("mensalidades", "Mensalidades em aberto", f.abertas.length, <>
                                {visiveis.map((p, i) => {
                                    const vencida = f.vencidas_ids.includes(p.id);
                                    const antecipada = !p.no_lote && posAte >= i;
                                    return (
                                        <div key={p.id} className="flex items-center gap-2.5 border-b border-[#F0F2F5] py-2 last:border-0 dark:border-white/10">
                                            {p.no_lote ? <span className="w-5 flex-none text-center text-[#4C9A2A]" title="Entra no link e no Pix">●</span> : atual.pode_pagar ? (
                                                <input type="checkbox" className="h-5 w-5 flex-none accent-[#313C55]" checked={antecipada} onChange={() => setAte(antecipada ? (i > 0 && !f.abertas[i - 1].no_lote ? f.abertas[i - 1].id : 0) : p.id)} aria-label={`Antecipar a parcela ${numParcela(p)}`} title="Antecipar (entra no link e no Pix)" />
                                            ) : <span className="w-5 flex-none" />}
                                            <span className={`min-w-0 flex-1 ${vencida ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}>
                                                <b className="text-[15px]">Parcela {numParcela(p)}</b> <span className="text-[14px]">· {mesAno(p.vencimento)}</span>{antecipada && <span className="ml-1.5 text-[11.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">antecipar</span>}
                                                <span className="block text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">{vencida ? "venceu" : "vence"} {data(p.vencimento)}</span>
                                            </span>
                                            <b className="text-[15px]">{reais(p.valor)}</b>
                                            {atual.pode_pagar && <button type="button" title="Enviar o boleto desta parcela" aria-label={`Enviar o boleto da parcela ${numParcela(p)}`} disabled={!!ocupado} onClick={() => cobrar("boleto", p)} className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-[#E1E5EC] text-[14px] hover:bg-[#F0F2F5] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10">{ocupado === `boleto${p.id}` ? "…" : "🧾"}</button>}
                                        </div>
                                    );
                                })}
                                {!f.abertas.length && <p className="py-2 text-[14.5px] text-[#4C9A2A]">Nenhuma mensalidade em aberto.</p>}
                                {!verTodas && f.abertas.length > visiveis.length && <button type="button" onClick={() => setVerTodas(true)} className="w-full py-2 text-center text-[14px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">Ver mais {f.abertas.length - visiveis.length} parcelas ▾</button>}
                            </>)
                        )}
                        {(dados.beneficiarios || []).length > 0 && (
                            secao("beneficiarios", "Beneficiários", dados.beneficiarios!.length, <>
                                {dados.beneficiarios!.map((b, i) => (
                                    <div key={i} className={`flex items-center gap-2 py-1.5 ${b.tipo === "T" ? "-mx-2 rounded-xl bg-[#F6F8FB] px-2 dark:bg-white/5" : ""}`}>
                                        <span className="min-w-0 flex-1">
                                            <b className="text-[14px]">{b.tipo === "P" ? "🐾 " : ""}{b.nome}</b>
                                            <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{[b.tipo === "T" ? "titular" : b.grau ? b.grau.toLowerCase() : "", b.idade !== null && b.idade !== undefined && b.tipo !== "P" ? `${b.idade} anos` : ""].filter(Boolean).join(" · ") || "—"}</span>
                                        </span>
                                        <span className={`flex-none rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${b.tipo === "T" ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#C9D1DE]"}`}>{TIPOS[b.tipo] || b.tipo || "—"}</span>
                                    </div>
                                ))}
                            </>)
                        )}
                        {(dados.cobrancas || []).length > 0 && (
                            secao("cobrancas", "Cobranças nesta conversa", dados.cobrancas!.length, <>
                                {dados.cobrancas!.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2 py-1.5 text-[14px]">
                                        <span className="min-w-0 flex-1"><b>{NOME_COBRANCA[c.tipo] || c.tipo}</b> · {reais(c.valor)}<span className="block text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">{new Date(c.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{c.por ? ` · ${c.por}` : ""}</span></span>
                                        {c.tipo === "pix" && <span className={`rounded-lg px-2 py-0.5 text-[11.5px] font-extrabold ${c.situacao === "F" ? "bg-[#EEF5D6] text-[#2F4207]" : c.situacao === "C" ? "bg-[#F0F2F5] text-[#4A5468]" : "bg-[#FBF0C9] text-[#5C4600]"}`}>{c.situacao === "F" ? "✅ pago" : c.situacao === "C" ? "cancelado" : "aguardando"}</span>}
                                    </div>
                                ))}
                            </>)
                        )}
                        <button type="button" className={`${btn} my-3 w-full`} onClick={() => carregar(atual.contrato)}>Atualizar dados</button>
                    </>
                )}
            </div>
            {dados && atual && f && f.quantidade_lote > 0 && atual.pode_pagar && (
                <div className="flex flex-none items-center gap-2 border-t border-[#E1E5EC] bg-[#F6F8FB] px-4 py-3 dark:border-white/12 dark:bg-[#1C2334]">
                    <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-extrabold uppercase text-[#5B6478] dark:text-[#AEB9CF]">{marcadas.length} parcela{marcadas.length > 1 ? "s" : ""}{antecipadas ? ` · ${antecipadas} antecipada${antecipadas > 1 ? "s" : ""}` : ""}</div>
                        <div className="text-[19px] font-extrabold">{reais(total)}</div>
                    </div>
                    <button type="button" className={btnPri} disabled={!!ocupado} onClick={() => cobrar("link")}>{ocupado === "link" ? "Gerando…" : "Link de Pagamento"}</button>
                    <button type="button" className={btn} disabled={!!ocupado} onClick={() => cobrar("pix")}>{ocupado === "pix" ? "…" : "Pix"}</button>
                </div>
            )}
        </>
    );

    return (
        <>
            {coluna ? (
                <aside aria-label="Cliente na Unymos" className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-[#E6E9EE] bg-white text-[#1F2638] dark:border-white/12 dark:bg-[#232B3F] dark:text-white">{conteudo}</aside>
            ) : (
                <div className="fixed inset-0 z-[75] flex justify-end bg-black/30" onClick={onFechar}>
                    <aside role="dialog" aria-modal="true" aria-label="Cliente na Unymos" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[470px] flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl dark:bg-[#232B3F] dark:text-white">{conteudo}</aside>
                </div>
            )}
            {historico && f && atual && <HistoricoPagamentos f={f} contrato={atual.contrato} plano={plano} titular={dados?.contrato?.titular || atual.titular || ""} desde={dados?.contrato?.data_contrato || ""} ocupado={ocupado} onRecibo={(p) => cobrar("recibo", p)} onFechar={() => setHistorico(false)} />}
            {vincular && <VincularContrato conversa={conversa} onFechar={() => setVincular(false)} onFeito={(n) => { setVincular(false); setAviso("Contato vinculado ao contrato."); setContratoAtual(n); carregar(n); }} />}
        </>
    );
}

function HistoricoPagamentos({ f, contrato, plano, titular, desde, ocupado, onRecibo, onFechar }: { f: NonNullable<Painel["financeiro"]>; contrato: string; plano: string; titular: string; desde: string; ocupado: string; onRecibo: (p: Parcela) => void; onFechar: () => void }) {
    const [todas, setTodas] = useState(false);
    const lista = todas ? f.pagas : f.pagas.slice(0, 8);
    const temData = f.pagas.some((p) => p.pago_em);
    const temForma = f.pagas.some((p) => p.forma);
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);
    const th = "px-3 py-2 text-left text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
    return (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Histórico de pagamentos" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white">
                <div className="flex items-center gap-3 border-b border-[#EEF0F3] px-5 py-4 dark:border-white/10">
                    <div className="min-w-0 flex-1"><h2 className="m-0 text-xl font-extrabold text-[#313C55] dark:text-white">Histórico de pagamentos</h2><div className="truncate text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Contrato {contrato}{plano ? ` · ${plano}` : ""}{titular ? ` · ${titular}` : ""}</div></div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0F2F5] dark:bg-white/10"><Icone nome="x" className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-1 gap-2 px-5 pt-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-[#EEF5D6] px-3 py-2 text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]"><div className="text-[11.5px] font-extrabold uppercase">Pago em {new Date().getFullYear()}</div><div className="text-[17px] font-extrabold">{reais(f.pago_ano)} · {f.pagas_ano} parcela{f.pagas_ano === 1 ? "" : "s"}</div></div>
                    <div className="rounded-xl bg-[#F0F2F5] px-3 py-2 dark:bg-white/10"><div className="text-[11.5px] font-extrabold uppercase text-[#5B6478] dark:text-[#AEB9CF]">Em aberto</div><div className="text-[17px] font-extrabold">{f.abertas.length} parcela{f.abertas.length === 1 ? "" : "s"}{f.em_atraso ? ` · ${reais(f.total_vencido)} em atraso` : ""}</div></div>
                    <div className="rounded-xl bg-[#F0F2F5] px-3 py-2 dark:bg-white/10"><div className="text-[11.5px] font-extrabold uppercase text-[#5B6478] dark:text-[#AEB9CF]">Cliente desde</div><div className="text-[17px] font-extrabold">{desde ? data(desde) : "—"}</div></div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
                    <table className="w-full border-collapse text-[14.5px]">
                        <thead><tr><th className={th}>Parcela</th><th className={th}>Vencimento</th>{temData && <th className={th}>Pagamento</th>}{temForma && <th className={th}>Forma</th>}<th className={`${th} text-right`}>Valor</th><th className={th} /></tr></thead>
                        <tbody>
                            {lista.map((p) => (
                                <tr key={p.id} className="border-t border-[#EEF0F3] dark:border-white/10">
                                    <td className="px-3 py-2.5"><b>Parcela {numParcela(p)}</b> · {mesAno(p.vencimento)}</td>
                                    <td className="px-3 py-2.5">{data(p.vencimento)}</td>
                                    {temData && <td className="px-3 py-2.5">{p.pago_em ? data(p.pago_em) : "—"}{p.pago_em && p.pago_em > p.vencimento ? <span className="ml-1 text-[11px] font-extrabold text-[#B42318]">atraso</span> : null}</td>}
                                    {temForma && <td className="px-3 py-2.5">{p.forma || "—"}</td>}
                                    <td className="px-3 py-2.5 text-right">{reais(p.valor)}</td>
                                    <td className="px-3 py-2.5 text-right"><button type="button" disabled={!!ocupado} onClick={() => onRecibo(p)} className="rounded-lg border border-[#C9D1DE] px-2.5 py-1 text-[12px] font-extrabold disabled:opacity-50 dark:border-white/25">{ocupado === `recibo${p.id}` ? "…" : "Recibo"}</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!f.pagas.length && <p className="py-4 text-center text-[14.5px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma parcela paga encontrada.</p>}
                </div>
                <div className="flex items-center gap-3 border-t border-[#EEF0F3] px-5 py-3 dark:border-white/10">
                    {!todas && f.pagas.length > lista.length ? <button type="button" onClick={() => setTodas(true)} className="flex-1 text-left text-[14px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">Ver parcelas mais antigas ({f.pagas.length - lista.length}) ▾</button> : <span className="flex-1" />}
                    <button type="button" className={btnPri} onClick={onFechar}>Fechar</button>
                </div>
            </div>
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
