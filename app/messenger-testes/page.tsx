"use client";

/**
 * Testes da Aurora (21/10/2026) — rota /messenger-testes
 *  Conversar: alguém da equipe escreve como cliente e vê o que a Aurora responde (mesmo caminho do WhatsApp, sem enviar
 *  nada pela Meta, sem fila, sem estoque, sem Unymos e sem perguntas frequentes).
 *  Cenários: o Claude faz o papel do cliente, conversa com a Aurora e avalia a conversa pelas regras do PAI.
 * Acesso: página "Messenger · Configurações". Servidor: messenger.php (ia_sim_*, ia_cenario*), messenger_testes.php.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";

type Linha = { quem: "cliente" | "aurora" | "nota" | "sistema"; texto: string };
type Cenario = { id: string; titulo: string; regras: string; max: number; origem?: "fixo" | "aprendizado"; db_id?: number };
type Avaliacao = { nota: number | null; aprovado: boolean | null; resumo?: string; pontos_fortes?: string[]; falhas?: { regra: string; trecho: string; sugestao?: string; gravidade?: "grave" | "ajuste" }[] };
type Resultado = { id: number; rodada: string; cenario: string; titulo: string; nota: number | null; aprovado: boolean | null; avaliacao: Avaliacao; conversa: Linha[]; criado_em: string; por: string | null };

// cenários marcados ficam guardados neste navegador (23/10/2026): cenário novo não entra marcado sozinho
const CHAVE_MARCADOS = "pai_testes_aurora_marcados";
function lerMarcados(): string[] | null {
    try {
        const v = JSON.parse(localStorage.getItem(CHAVE_MARCADOS) || "null");
        return Array.isArray(v) ? v.map(String) : null;
    } catch {
        return null;
    }
}
function gravarMarcados(ids: string[]) {
    try {
        localStorage.setItem(CHAVE_MARCADOS, JSON.stringify(ids));
    } catch {
        // navegador sem armazenamento: só não lembra a escolha
    }
}

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const rotulo = "text-[12.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";

function Conversa({ linhas, altura = "h-[520px]" }: { linhas: Linha[]; altura?: string }) {
    // rola só a caixa da conversa até o fim (scrollIntoView rolava a página inteira e deslocava a tela para os lados)
    const caixa = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = caixa.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [linhas.length]);
    return (
        <div ref={caixa} className={`${altura} min-w-0 overflow-y-auto overflow-x-hidden rounded-xl bg-[#EFEAE2] p-3 dark:bg-[#1C2334]`}>
            <div className="flex flex-col gap-1.5">
                {linhas.map((l, i) =>
                    l.quem === "sistema" ? (
                        <div key={i} className="self-center rounded-lg bg-white/90 px-3 py-1 text-center text-[12.5px] font-bold text-[#4A5468] dark:bg-white/10 dark:text-[#C9D1DE]">{l.texto}</div>
                    ) : l.quem === "nota" ? (
                        <div key={i} className="max-w-[90%] self-end whitespace-pre-wrap break-words rounded-xl border border-dashed border-[#C9A21E] bg-[#FFF4C2] px-3 py-2 text-[13px] text-[#4A3B00]"><b className="block text-[11px] tracking-wider">NOTA INTERNA</b>{l.texto}</div>
                    ) : (
                        <div key={i} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[15px] leading-snug ${l.quem === "cliente" ? "self-start bg-white text-[#1F2638] dark:bg-[#2A3349] dark:text-white" : "self-end bg-[#E3EFC0] text-[#1F2638] dark:bg-[#3B4A26] dark:text-white"}`}>
                            <b className="block text-[11.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{l.quem === "cliente" ? "Cliente" : "🤖 Aurora"}</b>
                            {l.texto}
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

function Simulador() {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [texto, setTexto] = useState("");
    const [contrato, setContrato] = useState("");
    const [anuncio, setAnuncio] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");
    const enviar = async () => {
        const t = texto.trim();
        if (!t || ocupado) return;
        setOcupado(true);
        setErro("");
        setLinhas((l) => [...l, { quem: "cliente", texto: t }]);
        setTexto("");
        try {
            const r = await msgPost("ia_sim_enviar", { texto: t, sessao: "manual", contrato, anuncio });
            if (!r?.dados) throw new Error("O servidor não devolveu a resposta da Aurora. Tente de novo; se repetir, me mande o print.");
            setLinhas(r.dados.conversa);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(false);
        }
    };
    const reiniciar = async () => {
        await msgPost("ia_sim_reiniciar", { sessao: "manual" }).catch(() => {});
        setLinhas([]);
    };
    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className={cartao}>
                <Conversa linhas={linhas} />
                {erro && <p className="mt-2 rounded-xl bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318]">{erro}</p>}
                <div className="mt-3 flex gap-2">
                    <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} rows={2} placeholder="Escreva como se fosse o cliente…" className="min-h-[52px] flex-1 resize-none rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] p-3 text-[15px] dark:border-white/15 dark:bg-[#1C2334]" />
                    <button type="button" onClick={enviar} disabled={ocupado || !texto.trim()} className="h-[52px] rounded-xl bg-[#313C55] px-5 text-[15px] font-extrabold text-white disabled:opacity-50">{ocupado ? "Aurora…" : "Enviar"}</button>
                </div>
            </section>
            <aside className={`${cartao} flex flex-col gap-3`}>
                <div className={rotulo}>Como o teste funciona</div>
                <p className="text-[13.5px] text-[#4A5468] dark:text-[#C9D1DE]">A mensagem passa pelo mesmo caminho do WhatsApp, mas nada sai para a Meta e ninguém da equipe é avisado. Coroa, proposta e link de pagamento são simulados: não entram na fila, no estoque, na Unymos nem nas perguntas frequentes.</p>
                <label className="block"><span className={rotulo}>Simular associado (nº do contrato)</span><input value={contrato} onChange={(e) => setContrato(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 000010" className="mt-1 h-10 w-full rounded-lg border border-[#E1E5EC] bg-white px-3 text-[14.5px] dark:border-white/15 dark:bg-[#1C2334]" /><span className="mt-0.5 block text-[12px] text-[#6B7488]">Vale da próxima conversa nova (depois de reiniciar). A Unymos é só lida.</span></label>
                <label className="block"><span className={rotulo}>Simular lead de anúncio</span><input value={anuncio} onChange={(e) => setAnuncio(e.target.value)} placeholder="Ex.: Plano FLEX a partir de R$ 48" className="mt-1 h-10 w-full rounded-lg border border-[#E1E5EC] bg-white px-3 text-[14.5px] dark:border-white/15 dark:bg-[#1C2334]" /></label>
                <button type="button" onClick={reiniciar} className="h-11 rounded-xl border border-[#C9D1DE] text-[14.5px] font-extrabold text-[#313C55] dark:border-white/25 dark:text-white">Reiniciar conversa</button>
            </aside>
        </div>
    );
}

function Cenarios() {
    const [cenarios, setCenarios] = useState<Cenario[]>([]);
    const [resultados, setResultados] = useState<Resultado[]>([]);
    const [marcados, setMarcados] = useState<string[]>([]);
    const [rodando, setRodando] = useState<{ cenario: string; linhas: Linha[] } | null>(null);
    const [status, setStatus] = useState({ claude: true, aurora: true });
    const [erro, setErro] = useState("");
    const [aberto, setAberto] = useState<number | null>(null);
    const [anteriores, setAnteriores] = useState(false);
    const [desativar, setDesativar] = useState<string | null>(null);
    const iniciou = useRef(false);
    const carregar = useCallback(async () => {
        try {
            const r = await msgGet<any>("ia_cenarios", {}, false);
            const lista: Cenario[] = r.cenarios;
            setCenarios(lista);
            setResultados(r.resultados);
            setStatus({ claude: r.claude, aurora: r.aurora });
            if (!iniciou.current) {
                // 1ª vez: a escolha guardada neste navegador; sem escolha, só os fixos. Cenário novo nunca entra marcado sozinho.
                iniciou.current = true;
                const ids = new Set(lista.map((c) => c.id));
                const salvos = lerMarcados();
                setMarcados(salvos ? salvos.filter((id) => ids.has(id)) : lista.filter((c) => c.origem !== "aprendizado").map((c) => c.id));
            } else {
                setMarcados((m) => m.filter((id) => lista.some((c) => c.id === id)));
            }
        } catch (e: any) {
            setErro(e.message);
        }
    }, []);
    const marcar = (ids: string[]) => {
        setMarcados(ids);
        gravarMarcados(ids);
    };
    const desativarCenario = async (c: Cenario) => {
        if (desativar !== c.id) {
            setDesativar(c.id); // 1º toque pede confirmação
            return;
        }
        setDesativar(null);
        try {
            await msgPost("apr_decidir", { tipo: "cenario", id: c.db_id, decisao: "inativo" });
            marcar(marcados.filter((x) => x !== c.id));
            await carregar();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    useEffect(() => {
        carregar();
    }, [carregar]);
    const rodar = async () => {
        setErro("");
        const agora = new Date();
        const rodada = `${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}${String(agora.getSeconds()).padStart(2, "0")}`;
        for (const id of marcados) {
            const cen = cenarios.find((c) => c.id === id);
            if (!cen) continue;
            setRodando({ cenario: cen.titulo, linhas: [] });
            try {
                for (let i = 0; i <= cen.max; i++) {
                    const r = await msgPost("ia_cenario_passo", { cenario: id, rodada });
                    if (!r?.dados) throw new Error("o servidor não devolveu a resposta");
                    setRodando({ cenario: cen.titulo, linhas: r.dados.conversa });
                    if (r.dados.fim) break;
                }
                await msgPost("ia_cenario_avaliar", { cenario: id, rodada });
            } catch (e: any) {
                setErro(`${cen.titulo}: ${e.message}`);
                break;
            }
            await carregar();
        }
        setRodando(null);
    };
    const [copiado, setCopiado] = useState(false);
    const copiarRelatorio = async () => {
        const linhas: string[] = [];
        for (const r of daRodada) {
            linhas.push(`### ${r.titulo} — nota ${r.nota ?? "—"} — ${r.aprovado ? "APROVADO" : "REPROVADO"}`);
            if (r.avaliacao?.resumo) linhas.push(`Resumo: ${r.avaliacao.resumo}`);
            for (const f of r.avaliacao?.falhas || []) linhas.push(`- ${f.gravidade === "grave" ? "Falha GRAVE" : f.gravidade === "ajuste" ? "Ajuste" : "Falha"}: ${f.regra} | “${f.trecho}”${f.sugestao ? ` | Sugestão: ${f.sugestao}` : ""}`);
            if (!r.aprovado) {
                // a conversa vai com as notas internas e os avisos do sistema (ex.: nota 🔎 com o motivo de uma falha do sistema)
                const quem: Record<string, string> = { cliente: "CLIENTE", aurora: "AURORA", nota: "NOTA INTERNA", sistema: "SISTEMA" };
                linhas.push("Conversa:");
                for (const l of r.conversa || []) linhas.push(`${quem[l.quem] || l.quem.toUpperCase()}: ${l.texto.replace(/\n+/g, " / ")}`);
            }
            linhas.push("");
        }
        const texto = `Testes da Aurora — rodada ${ultimaRodada}\n\n${linhas.join("\n")}`;
        try {
            await navigator.clipboard.writeText(texto);
        } catch {
            const t = document.createElement("textarea");
            t.value = texto;
            document.body.appendChild(t);
            t.select();
            document.execCommand("copy");
            t.remove();
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 3000);
    };
    const ultimaRodada = resultados[0]?.rodada;
    const daRodada = resultados.filter((r) => r.rodada === ultimaRodada);
    const aprovados = daRodada.filter((r) => r.aprovado).length;
    // último resultado de cada cenário (a lista do servidor vem do mais novo para o mais antigo)
    const ultimoDe = new Map<string, Resultado>();
    for (const r of resultados) if (!ultimoDe.has(r.cenario)) ultimoDe.set(r.cenario, r);
    const fixos = cenarios.filter((c) => c.origem !== "aprendizado");
    const aprendidos = cenarios.filter((c) => c.origem === "aprendizado");
    const atalhos: [string, string[]][] = [
        ["Todos", cenarios.map((c) => c.id)],
        ["Só os fixos", fixos.map((c) => c.id)],
        ["Reprovados na última vez", cenarios.filter((c) => ultimoDe.get(c.id)?.aprovado === false).map((c) => c.id)],
        ["Nunca rodados", cenarios.filter((c) => !ultimoDe.has(c.id)).map((c) => c.id)],
        ["Nenhum", []],
    ];
    const cartaoCenario = (c: Cenario) => {
        const u = ultimoDe.get(c.id);
        return (
            <div key={c.id} className="flex items-start gap-2 rounded-xl border border-[#EEF0F3] p-3 text-[14.5px] dark:border-white/10">
                <input type="checkbox" aria-label={c.titulo} className="mt-0.5 h-5 w-5 flex-none accent-[#313C55]" checked={marcados.includes(c.id)} disabled={!!rodando}
                    onChange={(e) => marcar(e.target.checked ? [...marcados, c.id] : marcados.filter((x) => x !== c.id))} />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                        <b className="min-w-0">{c.titulo}</b>
                        {u ? (
                            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${u.aprovado ? "bg-[#EEF5D6] text-[#2F4207]" : "bg-[#FDECEA] text-[#B42318]"}`}>última nota {u.nota ?? "—"}</span>
                        ) : (
                            <span className="rounded-full bg-[#E8EEF7] px-2 py-0.5 text-[11.5px] font-extrabold text-[#3D6A99]">novo</span>
                        )}
                    </span>
                    <span className="block text-[12.5px] text-[#5B6478] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden dark:text-[#AEB9CF]" title={c.regras}>{c.regras}</span>
                    {c.origem === "aprendizado" && !!c.db_id && (
                        <button type="button" disabled={!!rodando} onClick={() => desativarCenario(c)} className="mt-1 text-[12.5px] font-extrabold text-[#B42318] disabled:opacity-50">
                            {desativar === c.id ? "Toque de novo para desativar" : "Desativar cenário"}
                        </button>
                    )}
                </span>
            </div>
        );
    };
    return (
        <div className="flex flex-col gap-4">
            {(!status.claude || !status.aurora) && <p className="rounded-xl border border-[#C9A21E] bg-[#FBF0C9] px-4 py-2 text-[14px] font-bold text-[#5C4600]">{!status.claude ? "Falta a chave do Claude (anthropic_api_key) no pai-chaves.php. " : ""}{!status.aurora ? "Falta a chave da Aurora (openai_api_key)." : ""}</p>}
            {erro && <p className="rounded-xl bg-[#FDECEA] px-4 py-2 text-[14px] font-bold text-[#B42318]">{erro}</p>}
            <section className={cartao}>
                <div className="flex flex-wrap items-center gap-2"><span className={`${rotulo} flex-1`}>Cenários · o Claude faz o papel do cliente e avalia</span>
                    <button type="button" disabled={!!rodando || !marcados.length || !status.claude} onClick={rodar} className="h-11 rounded-xl bg-[#313C55] px-4 text-[14.5px] font-extrabold text-white disabled:opacity-50">{rodando ? "Rodando…" : `Rodar ${marcados.length} cenário(s)`}</button></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="self-center text-[12.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">Marcar:</span>
                    {atalhos.map(([nome, ids]) => (
                        <button key={nome} type="button" disabled={!!rodando} onClick={() => marcar(ids)} className="h-8 rounded-full border border-[#C9D1DE] px-3 text-[12.5px] font-extrabold disabled:opacity-50 dark:border-white/25">
                            {nome}{nome !== "Nenhum" ? ` (${ids.length})` : ""}
                        </button>
                    ))}
                </div>
                <div className={`${rotulo} mt-3`}>Fixos ({fixos.length})</div>
                <div className="mt-1 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">{fixos.map(cartaoCenario)}</div>
                {aprendidos.length > 0 && (
                    <>
                        <div className={`${rotulo} mt-3`}>🔁 Vindos do aprendizado ({aprendidos.length})</div>
                        <p className="mt-0.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Entram desmarcados. Se um repetir outro, desative aqui.</p>
                        <div className="mt-1 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">{aprendidos.map(cartaoCenario)}</div>
                    </>
                )}
            </section>
            {rodando && (
                <section className={cartao}>
                    <div className={rotulo}>Agora: {rodando.cenario}</div>
                    <div className="mt-2"><Conversa linhas={rodando.linhas} altura="h-[360px]" /></div>
                </section>
            )}
            {daRodada.length > 0 && (
                <section className={cartao}>
                    <div className="mb-2 flex flex-wrap items-baseline gap-2"><span className={`${rotulo} flex-1`}>Última rodada</span><span className="text-[14px] font-extrabold">{aprovados} de {daRodada.length} aprovados · média {(daRodada.reduce((t, r) => t + (r.nota || 0), 0) / daRodada.length).toFixed(1)}</span>
                        <button type="button" onClick={copiarRelatorio} className="h-9 rounded-xl border border-[#C9D1DE] px-3 text-[13.5px] font-extrabold dark:border-white/25">{copiado ? "✓ Copiado" : "Copiar relatório"}</button></div>
                    {(anteriores ? resultados : daRodada).map((r) => (
                        <div key={r.id} className="border-t border-[#EEF0F3] py-3 first:border-0 dark:border-white/10">
                            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                                <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-[15px] font-extrabold ${r.aprovado ? "bg-[#EEF5D6] text-[#2F4207]" : "bg-[#FDECEA] text-[#B42318]"}`}>{r.nota ?? "—"}</span>
                                <span className="min-w-0 flex-1"><b className="text-[15px]">{r.titulo}</b><span className="block truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{r.avaliacao?.resumo}</span></span>
                                <span className="flex-none text-[12px] text-[#6B7488]">{new Date(r.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                            </button>
                            {aberto === r.id && (
                                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <div>
                                        {(r.avaliacao?.falhas || []).length > 0 && <div className={rotulo}>O que falhou</div>}
                                        {(r.avaliacao?.falhas || []).map((f, i) => (
                                            <div key={i} className={`mt-2 rounded-xl p-3 text-[14px] ${f.gravidade === "ajuste" ? "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F0C94A]/15 dark:text-[#F5E3A3]" : "bg-[#FDECEA] text-[#5A1A12] dark:bg-[#FF9C92]/15 dark:text-[#FFD6D1]"}`}>{f.gravidade && <span className="mr-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-extrabold uppercase dark:bg-black/20">{f.gravidade === "grave" ? "Grave" : "Ajuste"}</span>}<b>{f.regra}</b><span className="mt-1 block italic">“{f.trecho}”</span>{f.sugestao && <span className="mt-1 block">→ {f.sugestao}</span>}</div>
                                        ))}
                                        {(r.avaliacao?.pontos_fortes || []).length > 0 && <div className={`${rotulo} mt-3`}>Pontos fortes</div>}
                                        <ul className="mt-1 list-disc pl-5 text-[14px]">{(r.avaliacao?.pontos_fortes || []).map((p, i) => <li key={i}>{p}</li>)}</ul>
                                    </div>
                                    <Conversa linhas={r.conversa || []} altura="h-[380px]" />
                                </div>
                            )}
                        </div>
                    ))}
                    {resultados.length > daRodada.length && <button type="button" onClick={() => setAnteriores((v) => !v)} className="mt-2 text-[14px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{anteriores ? "Mostrar só a última rodada" : `Mostrar rodadas anteriores (${resultados.length - daRodada.length})`}</button>}
                </section>
            )}
        </div>
    );
}

export default function TestesAuroraPage() {
    const [aba, setAba] = useState<"conversar" | "cenarios">("conversar");
    return (
        // contain:inline-size — a largura da página vem da área do app, não do conteúdo (textos longos e linhas
        // "truncate" faziam a página ficar mais larga que a tela e cortar a direita)
        <div className="w-full min-w-0 max-w-full overflow-x-hidden p-4 text-[#313C55] [contain:inline-size] md:p-6 dark:text-white">
            <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-extrabold md:text-[30px]">🤖 Testes da Aurora</h1>
                    <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Converse com a Aurora como se fosse um cliente, ou deixe o Claude fazer os papéis e avaliar cada conversa pelas regras do PAI. Rode os cenários sempre que mudarmos as instruções dela.</p>
                </div>
                <div className="flex gap-2">
                    {([["conversar", "Conversar com a Aurora"], ["cenarios", "Cenários com avaliação"]] as const).map(([k, n]) => (
                        <button key={k} type="button" onClick={() => setAba(k)} aria-pressed={aba === k} className={`h-10 rounded-full px-4 text-[14.5px] ${aba === k ? "bg-[#E3EFC0] font-extrabold text-[#2F4207]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>{n}</button>
                    ))}
                </div>
                {aba === "conversar" ? <Simulador /> : <Cenarios />}
            </div>
        </div>
    );
}
