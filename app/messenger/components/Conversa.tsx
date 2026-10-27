"use client";

import React, { useEffect, useRef, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";
import { formatoAudio, GravadorMp3 } from "@/components/messenger/compressao";
import type { Conversa as TConversa, Mensagem, Perfil, Anexo as TAnexo } from "@/components/messenger/tipos";
import { Avatar, Icone, previa, SeloCor, SelosEtiquetas } from "./Lista";
import { BarraBusca, MenuAnexar, MenuMensagem, Reacoes, SugestoesRespostas } from "./Acoes";
import { SeloUnymos } from "./PainelCliente";
import ModeloCampos from "@/components/messenger/ModeloCampos";
import { baixarAnexo } from "@/components/messenger/salvarArquivos";

const EMOJIS: Record<string, string[]> = {
    Rostos: ["😀", "😂", "😊", "😍", "🥲", "😢", "😔", "😮", "🙂", "😉", "🤗", "😴"],
    Gestos: ["🙏", "👍", "👏", "🙌", "🤝", "💪", "👀", "👋", "✌️", "👌", "🫡", "🤞"],
    Símbolos: ["❤️", "💐", "🌹", "🕊️", "✅", "❗", "⏰", "📍", "📄", "🚗", "☕", "🔥"],
};

/* ---------------- anexos (link temporário buscado sob demanda) ---------------- */
const cacheLinks = new Map<string, { url: string; ate: number }>();
async function linkAnexo(id: number, miniatura = false): Promise<string> {
    const k = `${id}:${miniatura ? "m" : "o"}`;
    const c = cacheLinks.get(k);
    if (c && c.ate > Date.now()) return c.url;
    const d = await msgGet<{ url: string; expira_em_s: number }>("anexo_url", { anexo_id: id, variante: miniatura ? "miniatura" : "" });
    cacheLinks.set(k, { url: d.url, ate: Date.now() + (d.expira_em_s - 120) * 1000 });
    return d.url;
}

function BotaoBaixar({ a, claro = false }: { a: TAnexo; claro?: boolean }) {
    const [ocupado, setOcupado] = useState(false);
    return (
        <button type="button" disabled={ocupado} onClick={async (e) => { e.stopPropagation(); setOcupado(true); try { await baixarAnexo(a); } catch { window.alert("Não foi possível baixar o arquivo agora."); } finally { setOcupado(false); } }}
            className={`flex h-8 w-8 flex-none items-center justify-center rounded-full disabled:opacity-60 ${claro ? "bg-black/55 text-white hover:bg-black/70" : "text-[#313C55] hover:bg-black/10 dark:text-white dark:hover:bg-white/10"}`}
            aria-label={`Baixar ${a.nome_original || "arquivo"}`} title="Salvar no aparelho">
            {ocupado ? <span className="text-[11px]">…</span> : <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>}
        </button>
    );
}

function Anexo({ a, minha }: { a: TAnexo; minha: boolean }) {
    const [url, setUrl] = useState("");
    const [erro, setErro] = useState(false);
    const imagem = a.mime.startsWith("image/");
    const audio = a.mime.startsWith("audio/");
    useEffect(() => {
        let vivo = true;
        if (imagem || audio) linkAnexo(a.id, imagem && a.tem_miniatura).then((u) => vivo && setUrl(u)).catch(() => vivo && setErro(true));
        return () => {
            vivo = false;
        };
    }, [a.id, imagem, audio, a.tem_miniatura]);
    const abrirOriginal = async () => {
        try {
            window.open(await linkAnexo(a.id), "_blank", "noopener");
        } catch {
            setErro(true);
        }
    };
    if (imagem) {
        return (
            <div className="relative mb-1" style={{ width: 280, maxWidth: "100%" }}>
                <button type="button" onClick={abrirOriginal} className="block w-full overflow-hidden rounded-lg bg-[#F0F2F5] dark:bg-[#1C2334]" style={{ aspectRatio: a.largura && a.altura ? `${a.largura}/${a.altura}` : "4/3" }} aria-label="Abrir foto">
                    {url ? <img src={url} alt="Foto enviada" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-bold text-[#6B7488] dark:text-[#AEB9CF]">{erro ? "Foto indisponível" : "Carregando foto…"}</span>}
                </button>
                <span className="absolute right-1.5 top-1.5"><BotaoBaixar a={a} claro /></span>
            </div>
        );
    }
    if (audio) {
        return url ? <span className="my-1 flex items-center gap-1"><audio controls preload="metadata" src={url} className="w-[260px] max-w-full" /><BotaoBaixar a={a} /></span> : <span className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">{erro ? "Áudio indisponível" : "Carregando áudio…"}</span>;
    }
    const kb = Math.max(1, Math.round(a.tamanho_bytes / 1024));
    return (
        <div className={`mb-1 flex min-w-[220px] items-center gap-2 rounded-lg p-2 ${minha ? "bg-[#D4E5A2] dark:bg-white/10" : "bg-[#F0F2F5] dark:bg-[#1C2334]"}`}>
            <button type="button" onClick={abrirOriginal} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Abrir ${a.nome_original || "documento"}`}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[#3D6A99] text-white"><Icone nome="file" /></span>
                <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{a.nome_original || "Documento"}</span>
                    <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">{kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}</span>
                </span>
            </button>
            <BotaoBaixar a={a} />
        </div>
    );
}

/* ---------------- bolha (estilo WhatsApp) ---------------- */
const TIQUE_AZUL = "#3D6A99";
function Tiques({ estado }: { estado: "enviando" | "enviada" | "entregue" | "lida" }) {
    if (estado === "enviando") return <span aria-label="Enviando"><Icone nome="clock" className="h-[14px] w-[14px] text-[#6B7488] dark:text-[#C9D1DE]" /></span>;
    if (estado === "enviada") return <span aria-label="Enviada"><Icone nome="check" className="h-4 w-4 text-[#6B7488] dark:text-[#C9D1DE]" /></span>;
    return <span className={estado === "lida" ? "text-[#3D6A99] dark:text-[#A9BED6]" : "text-[#6B7488] dark:text-[#C9D1DE]"} aria-label={estado === "lida" ? "Lida" : "Entregue"}><Icone nome="checks" className="h-4 w-4" /></span>;
}

/**
 * Texto com a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```monoespaçado```) e links clicáveis,
 * para a mensagem aparecer no Messenger como aparece no celular do cliente.
 */
const PADRAO_FORMATO = /(https?:\/\/[^\s<]+)|```([^`]+)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
export function TextoFormatado({ texto }: { texto: string }) {
    const partes: React.ReactNode[] = [];
    let ultimo = 0;
    let n = 0;
    for (const a of texto.matchAll(PADRAO_FORMATO)) {
        const i = a.index ?? 0;
        if (i > ultimo) partes.push(texto.slice(ultimo, i));
        if (a[1]) partes.push(<a key={n++} href={a[1]} target="_blank" rel="noopener noreferrer" className="break-all underline">{a[1]}</a>);
        else if (a[2]) partes.push(<code key={n++} className="rounded bg-black/10 px-1 font-mono text-[0.92em] dark:bg-white/15">{a[2]}</code>);
        else if (a[3]) partes.push(<b key={n++}>{a[3]}</b>);
        else if (a[4]) partes.push(<i key={n++}>{a[4]}</i>);
        else if (a[5]) partes.push(<s key={n++}>{a[5]}</s>);
        ultimo = i + a[0].length;
    }
    if (ultimo < texto.length) partes.push(texto.slice(ultimo));
    return <>{partes}</>;
}

/** Orçamento que a Aurora montou na conversa com a família (mesmo motor do Orçamento/OS): o atendente confere e envia. */
type OrcIa = { id: number; status: string; falecido: string | null; convenio: string; linhas: { rotulo: string; nome: string; coberto: boolean; valor: number | null; obs: string; oculto: boolean }[]; familia: number; coberto: number; pendentes: number; avisos: string[]; texto: string; escolhas: Record<string, any> };
function OrcamentoAurora({ conversaId, onFechar, onUsar }: { conversaId: number; onFechar: () => void; onUsar: (t: string) => void }) {
    const [o, setO] = useState<OrcIa | null | undefined>(undefined);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        msgGet<OrcIa | null>("orc_ia", { conversa_id: conversaId }).then(setO).catch((e) => setErro(e.message));
    }, [conversaId]);
    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const decidir = async (decisao: "aprovar" | "descartar") => {
        if (!o) return;
        setOcupado(true);
        try {
            await msgPost("orc_ia_decidir", { conversa_id: conversaId, id: o.id, decisao });
            if (decisao === "aprovar") onUsar(o.texto);
            else onFechar();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(false);
        }
    };
    const grupo = (titulo: string, itens: OrcIa["linhas"], cob: boolean) => itens.length > 0 && (
        <div className="mt-2">
            <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{titulo}</div>
            {itens.map((l, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-[#F0F2F5] py-2 text-[14.5px] last:border-0 dark:border-white/10">
                    <span className="min-w-0 flex-1"><b>{l.rotulo}</b>{l.nome ? <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{l.nome}</span> : null}</span>
                    {cob ? <span className="rounded-full bg-[#EEF5D6] px-2 py-0.5 text-[11.5px] font-extrabold text-[#2F4207]">coberto</span> : <b>{l.valor === null ? "a confirmar" : brl(l.valor)}</b>}
                </div>
            ))}
        </div>
    );
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Orçamento preparado pela Aurora" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white">
                <div className="border-b border-[#EEF0F3] bg-[#F4F8FC] px-5 py-4 dark:border-white/10 dark:bg-[#3D6A99]/15">
                    <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#3D6A99] dark:text-[#A9BED6]">🤖 Orçamento preparado pela Aurora</div>
                    <div className="mt-1 flex items-center gap-2"><b className="flex-1 text-[18px]">{o?.falecido || "Atendimento funerário"}</b>{o && <span className="rounded-lg bg-[#FBF0C9] px-2 py-0.5 text-[12px] font-extrabold text-[#5C4600]">{o.status === "aguardando" ? "aguardando conferência" : "conferido"}</span>}</div>
                    {o && <div className="text-[13.5px] text-[#4A5468] dark:text-[#C9D1DE]">{o.convenio}</div>}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                    {erro && <p className="my-2 rounded-xl bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318]">{erro}</p>}
                    {o === undefined && !erro && <p className="py-4">Carregando…</p>}
                    {o === null && <p className="py-4">Não há orçamento da Aurora nesta conversa.</p>}
                    {o && (
                        <>
                            {grupo("Coberto pelo plano", o.linhas.filter((l) => l.coberto), true)}
                            {grupo(o.linhas.some((l) => l.coberto) ? "Por conta da família" : "Itens", o.linhas.filter((l) => !l.coberto), false)}
                            {o.avisos.length > 0 && <div className="mt-3 rounded-xl bg-[#FBF0C9] px-3 py-2 text-[13px] text-[#5C4600]">{o.avisos.join(" · ")}</div>}
                            <p className="mt-3 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Calculado pelo mesmo motor do Orçamento e da OS (preços do dia). Itens não perguntados pela Aurora (véu, cordão, ornamentação, kit lanche…) ficam com você. Ao conferir, o texto vai para o campo de mensagem para revisar antes de enviar.</p>
                        </>
                    )}
                </div>
                {o && (
                    <div className="border-t border-[#E1E5EC] bg-[#F6F8FB] px-5 py-3 dark:border-white/12 dark:bg-[#1C2334]">
                        <div className="flex items-baseline gap-2"><span className="flex-1 text-[12.5px] font-extrabold uppercase text-[#5B6478] dark:text-[#AEB9CF]">{o.coberto > 0 ? `Coberto ${brl(o.coberto)} · ` : ""}Família paga</span><b className="text-[22px]">{brl(o.familia)}</b></div>
                        {o.pendentes > 0 && <div className="text-right text-[12.5px] text-[#8A6A00]">+ {o.pendentes} item(ns) a confirmar</div>}
                        <div className="mt-2 flex gap-2">
                            <button type="button" disabled={ocupado || o.status !== "aguardando"} onClick={() => decidir("aprovar")} className="h-11 flex-1 rounded-xl bg-[#4C9A2A] px-4 text-[14.5px] font-extrabold text-white disabled:opacity-50">Conferido · colocar na mensagem</button>
                            <button type="button" disabled={ocupado || o.status !== "aguardando"} onClick={() => decidir("descartar")} className="h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14.5px] font-extrabold text-[#B42318] disabled:opacity-50 dark:bg-[#232B3F]">Descartar</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** "Dados da mensagem" (como no WhatsApp): quem leu, quem ainda não leu e quem reagiu com cada emoji. */
function DadosMensagem({ m, conversa, eu, minha, onFechar }: { m: Mensagem; conversa: TConversa; eu: number; minha: boolean; onFechar: () => void }) {
    const outros = conversa.membros.filter((p) => p.usuario_id !== eu && p.usuario_id !== m.autor_usuario_id && p.papel !== "observador");
    const leram = outros.filter((p) => p.ultima_lida_id >= m.id);
    const naoLeram = outros.filter((p) => p.ultima_lida_id < m.id);
    const reacoes = m.reacoes || [];
    const nomeDe = (id: number, nome?: string | null) => (id === eu ? "Você" : nome || conversa.membros.find((p) => p.usuario_id === id)?.nome || "—");
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);
    const lista = "rounded-2xl bg-white px-3 dark:bg-[#232B3F]";
    const linha = "flex items-center gap-2 border-b border-[#F0F2F5] py-2.5 text-[15.5px] last:border-0 dark:border-white/10";
    const titulo = "mt-3 px-1 text-[12px] font-extrabold uppercase tracking-wider";
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 md:items-center" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Dados da mensagem" onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-[#F4F6F9] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-3xl dark:bg-[#1C2334]">
                <div className="flex items-center gap-2">
                    <h2 className="m-0 flex-1 text-lg font-extrabold text-[#313C55] dark:text-white">Dados da mensagem</h2>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><Icone nome="x" className="h-5 w-5" /></button>
                </div>
                <div className="mt-2 line-clamp-3 rounded-xl bg-[#E3EFC0] px-3 py-2 text-[15px] text-[#1F2638] dark:bg-[#3D6A99]/30 dark:text-white">{m.texto || (m.anexos[0]?.nome_original ?? "Anexo")}</div>
                {minha && conversa.tipo === "grupo" && (
                    <>
                        <div className={`${titulo} text-[#3D6A99] dark:text-[#A9BED6]`}>✓✓ Lida por · {leram.length}</div>
                        <div className={lista}>{leram.length ? leram.map((p) => <div key={p.usuario_id} className={linha}><b className="flex-1">{p.nome}</b></div>) : <p className="py-2.5 text-[14.5px] text-[#6B7488]">Ninguém leu ainda.</p>}</div>
                        <div className={`${titulo} text-[#5B6478] dark:text-[#AEB9CF]`}>✓ Ainda não leu · {naoLeram.length}</div>
                        <div className={lista}>{naoLeram.length ? naoLeram.map((p) => <div key={p.usuario_id} className={linha}><b className="flex-1">{p.nome}</b></div>) : <p className="py-2.5 text-[14.5px] text-[#6B7488]">Todos já leram.</p>}</div>
                    </>
                )}
                {minha && conversa.tipo === "individual" && <div className={`${titulo} text-[#3D6A99] dark:text-[#A9BED6]`}>{leram.length ? "✓✓ Lida" : "✓ Ainda não lida"}</div>}
                <div className={`${titulo} text-[#5B6478] dark:text-[#AEB9CF]`}>Reações · {reacoes.length}</div>
                <div className={lista}>{reacoes.length ? reacoes.map((r) => <div key={`${r.usuario_id}${r.emoji}`} className={linha}><span className="w-8 text-xl">{r.emoji}</span><b className="flex-1">{nomeDe(r.usuario_id, r.nome)}</b></div>) : <p className="py-2.5 text-[14.5px] text-[#6B7488]">Sem reações.</p>}</div>
            </div>
        </div>
    );
}

/** Trecho da mensagem respondida, dentro do balão (como no WhatsApp). */
function Citacao({ m, eu }: { m: Mensagem | null | undefined; eu: number }) {
    const autor = !m ? "" : m.autor_tipo === "usuario" && m.autor_usuario_id === eu ? "Você" : m.autor_nome || "—";
    return (
        <div className="mb-1 rounded-md border-l-4 border-[#3D6A99] bg-black/5 px-2.5 py-1.5 text-[14px] dark:border-[#A9BED6] dark:bg-white/10">
            <div className="font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{autor || "Mensagem"}</div>
            <div className="line-clamp-2 break-words text-[#4A5468] dark:text-[#C9D1DE]">{m ? previa(m) : "Mensagem anterior"}</div>
        </div>
    );
}

/** 👍/👎 do atendente na mensagem da Aurora (entra na análise do Aprendizado da Aurora). */
function AvaliarAurora({ mensagemId }: { mensagemId: number }) {
    const [feito, setFeito] = useState<"" | "bom" | "ruim">("");
    const enviar = async (util: boolean) => {
        let motivo = "";
        if (!util) {
            const r = window.prompt("O que a Aurora deveria ter feito? (opcional, ajuda no aprendizado)");
            if (r === null) return;
            motivo = r;
        }
        try {
            await msgPost("ia_feedback", { mensagem_id: mensagemId, util, motivo });
            setFeito(util ? "bom" : "ruim");
        } catch (e: any) {
            window.alert(e.message);
        }
    };
    if (feito) return <span className="text-[11.5px] font-bold text-[#4C9A2A]">{feito === "bom" ? "👍 obrigado" : "👎 anotado"}</span>;
    return (
        <span className="flex gap-1">
            <button type="button" onClick={(e) => { e.stopPropagation(); enviar(true); }} title="A Aurora acertou" aria-label="A Aurora acertou" className="rounded px-1 opacity-60 hover:bg-black/10 hover:opacity-100">👍</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); enviar(false); }} title="A Aurora errou" aria-label="A Aurora errou" className="rounded px-1 opacity-60 hover:bg-black/10 hover:opacity-100">👎</button>
        </span>
    );
}

function Bolha({ m, conversa, eu, onApagar, primeiraDoBloco, citada, onResponder, onReagir, onEncaminhar, destaque, onFixar, fixada }: { m: Mensagem; conversa: TConversa; eu: number; onApagar: (m: Mensagem) => void; primeiraDoBloco: boolean; citada?: Mensagem | null; onResponder?: (m: Mensagem) => void; onReagir?: (m: Mensagem, emoji: string) => void; onEncaminhar?: (m: Mensagem) => void; destaque?: "atual" | "outro" | null; onFixar?: (m: Mensagem) => void; fixada?: boolean }) {
    const [puxar, setPuxar] = useState(0);
    const [menu, setMenu] = useState(false);
    const [dados, setDados] = useState(false); // "Dados da mensagem": quem leu e quem reagiu
    const toqueLongo = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toque = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
    const automatica = m.autor_tipo === "sistema" && m.tipo !== "sistema"; // pacote 4B: boas-vindas, menu, fora do horário, avaliação
    if (m.autor_tipo === "sistema" && !automatica) {
        return <div className="my-1 self-center rounded-lg bg-white/90 px-3 py-1 text-center text-[14px] font-bold text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F] dark:text-[#AEB9CF]">{m.texto}</div>;
    }
    const minha = (m.autor_tipo === "usuario" && m.autor_usuario_id === eu) || automatica;
    const hora = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let leitura: React.ReactNode = null;
    if (minha && !m.apagada) {
        if (m._enviando) leitura = <Tiques estado="enviando" />;
        else if (m._falhaLocal) leitura = <span className="font-extrabold text-[#B42318] dark:text-[#FF9C92]">Não enviada</span>;
        else if (conversa.tipo === "externo") {
            const st = m.status_envio;
            leitura = st === "falhou" ? <span className="font-extrabold text-[#B42318] dark:text-[#FF9C92]" title={m.erro_envio || ""}>Falhou</span>
                : <Tiques estado={st === "lida" ? "lida" : st === "entregue" ? "entregue" : "enviada"} />;
        } else {
            // azul: todos leram · dois tiques cinza: alguém leu (grupo) · um tique: enviada
            const outros = conversa.membros.filter((p) => p.usuario_id !== eu);
            const leram = outros.filter((p) => p.ultima_lida_id >= m.id).length;
            leitura = (
                <span className="flex items-center" title={conversa.tipo === "grupo" && leram > 0 ? `Lida por ${leram} de ${outros.length}` : undefined}>
                    <Tiques estado={leram > 0 && leram === outros.length ? "lida" : leram > 0 ? "entregue" : "enviada"} />
                </span>
            );
        }
    }
    const podeApagar = minha && !m.apagada && !m._enviando && conversa.canal === "interno" && Date.now() - new Date(m.criado_em).getTime() < 15 * 60000;
    const podeResponder = !!onResponder && !m.apagada && !m._enviando && m.id < Number.MAX_SAFE_INTEGER;
    const salva = !m.apagada && !m._enviando && m.id < Number.MAX_SAFE_INTEGER;
    const temMenu = salva && (!!onReagir || podeResponder || (!!onEncaminhar && !m.interna) || !!m.texto || podeApagar);
    const cancelarToqueLongo = () => {
        if (toqueLongo.current) clearTimeout(toqueLongo.current);
        toqueLongo.current = null;
    };
    const cantos = primeiraDoBloco ? (minha ? "rounded-[10px] rounded-tr-none" : "rounded-[10px] rounded-tl-none") : "rounded-[10px]";
    return (
        <div
            id={`msg-${m.id}`}
            // no celular o toque longo abre o menu sem selecionar o texto (copiar fica no menu); no computador dá para selecionar
            className={`group relative max-w-[85%] select-none md:max-w-[75%] md:select-text ${minha ? "self-end" : "self-start"} ${primeiraDoBloco ? "mt-1.5" : ""} ${destaque === "atual" ? "rounded-[12px] ring-2 ring-[#F2CB3F] ring-offset-2 ring-offset-transparent" : ""}`}
            style={{ transform: puxar ? `translateX(${puxar}px)` : undefined, transition: toque.current ? undefined : "transform .2s", touchAction: "pan-y", WebkitTouchCallout: "none" }}
            onTouchStart={(e) => {
                if (podeResponder) toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
                // toque longo (meio segundo) abre o menu: reagir, responder, encaminhar, copiar, apagar
                if (temMenu) {
                    cancelarToqueLongo();
                    toqueLongo.current = setTimeout(() => {
                        toque.current = null;
                        setPuxar(0);
                        setMenu(true);
                    }, 480);
                }
            }}
            onContextMenu={(e) => { if (temMenu && "ontouchstart" in window) e.preventDefault(); }}
            onTouchMove={(e) => {
                const t = toque.current;
                if (!t) return;
                const dx = e.touches[0].clientX - t.x;
                const dy = e.touches[0].clientY - t.y;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelarToqueLongo();
                if (t.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) t.horizontal = Math.abs(dx) > Math.abs(dy) && dx > 0;
                if (t.horizontal) setPuxar(Math.max(0, Math.min(80, dx)));
            }}
            onTouchEnd={() => {
                cancelarToqueLongo();
                const passou = puxar > 55;
                toque.current = null;
                setPuxar(0);
                if (passou && onResponder) onResponder(m); // deslizar para a direita = responder (como no WhatsApp)
            }}
        >
            {puxar > 0 && (
                <span className="absolute -left-9 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/10 text-[#3D6A99] dark:bg-white/15 dark:text-[#A9BED6]" style={{ opacity: Math.min(1, puxar / 55) }} aria-hidden="true">
                    <Icone nome="responder" className="h-4 w-4" />
                </span>
            )}
            <div className={`px-3 pb-1.5 pt-1.5 text-[17px] leading-snug text-[#1F2638] md:text-[15.5px] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] ${cantos} ${m.interna ? "border border-dashed border-[#C9A21E] bg-[#FFF4C2] dark:border-[#F2CB3F]/60 dark:bg-[#4A3F12] dark:text-white" : minha ? "bg-[#E3EFC0] dark:bg-[#3D6A99] dark:text-white" : "bg-white dark:bg-[#232B3F] dark:text-white"}`}>
                {automatica && !m.interna && (
                    <div className="mb-0.5 flex items-center gap-2 text-[12.5px] font-extrabold text-[#4A5468] dark:text-[#C9D1DE]">
                        <span className="flex-1">🤖 Mensagem automática</span>
                        <AvaliarAurora mensagemId={m.id} />
                    </div>
                )}
                {m.interna && <div className="mb-0.5 flex items-center gap-1 text-[12.5px] font-extrabold uppercase tracking-wide text-[#8A6A00] dark:text-[#F7E39A]"><Icone nome="nota" className="h-3.5 w-3.5" />Nota interna · só a equipe vê{!minha && m.autor_nome ? ` · ${m.autor_nome.split(" ")[0]}` : ""}</div>}
                {temMenu && (
                    <button type="button" onClick={() => setMenu((v) => !v)} className={`absolute right-1 top-1 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-black/10 text-[#313C55] md:group-hover:flex dark:bg-white/15 dark:text-white ${menu ? "md:flex" : ""}`} aria-label="Opções da mensagem" aria-expanded={menu}>
                        <Icone nome="chevron" className="h-4 w-4" />
                    </button>
                )}
                {!minha && conversa.tipo !== "individual" && primeiraDoBloco && <div className="mb-0.5 text-[14.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{m.autor_nome || "—"}</div>}
                {m.apagada ? (
                    <span className="italic text-[#6B7488] dark:text-[#C9D1DE]">Mensagem apagada</span>
                ) : (
                    <>
                        {m.responde_a_id ? <Citacao m={citada} eu={eu} /> : null}
                        {m.anexos.map((a) => <Anexo key={a.id} a={a} minha={minha} />)}
                        {m.texto && m.tipo !== "audio" && <span className="whitespace-pre-wrap break-words"><TextoFormatado texto={m.texto} /></span>}
                        {m.transcricao && (
                            <details className="mt-1 max-w-[300px] text-[14px]">
                                <summary className="cursor-pointer text-[12.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">📝 Transcrição (Aurora)</summary>
                                <span className="mt-0.5 block whitespace-pre-wrap break-words italic text-[#4A5468] dark:text-[#C9D1DE]">{m.transcricao}</span>
                            </details>
                        )}
                    </>
                )}
                <span className="float-right ml-2.5 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[12.5px] font-semibold text-[#5B6478] dark:text-[#C9D1DE]">
                    {podeResponder && (
                        <button type="button" onClick={() => onResponder!(m)} className="hidden items-center rounded px-1 hover:bg-black/5 md:group-hover:flex" aria-label="Responder esta mensagem" title="Responder">
                            <Icone nome="responder" className="h-3.5 w-3.5" />
                        </button>
                    )}

                    {hora} {leitura}
                </span>
            </div>
            {menu && (
                <MenuMensagem
                    m={m}
                    minha={minha}
                    eu={eu}
                    onFechar={() => setMenu(false)}
                    onReagir={onReagir && !m.interna ? (e) => onReagir(m, e) : undefined}
                    onResponder={podeResponder ? () => onResponder!(m) : undefined}
                    onEncaminhar={onEncaminhar && !m.interna && m.tipo !== "modelo" ? () => onEncaminhar(m) : undefined}
                    onFixar={onFixar ? () => onFixar(m) : undefined}
                    fixada={fixada}
                    onApagar={podeApagar ? () => onApagar(m) : undefined}
                    onDados={conversa.tipo !== "externo" && !m._enviando && (minha || (m.reacoes || []).length > 0) ? () => setDados(true) : undefined}
                />
            )}
            <Reacoes m={m} eu={eu} minha={minha} onReagir={onReagir ? (e) => onReagir(m, e) : undefined} onVer={conversa.tipo === "grupo" ? () => setDados(true) : undefined} />
            {dados && <DadosMensagem m={m} conversa={conversa} eu={eu} minha={minha} onFechar={() => setDados(false)} />}
            {m._falhaLocal && <div className="mt-1 text-right text-xs font-bold text-[#B42318] dark:text-[#FF9C92]">{m._falhaLocal}</div>}
        </div>
    );
}

/* ---------------- gravador de áudio ---------------- */
/**
 * Conversa com cliente do WhatsApp (mp3 = true): capta o microfone direto e entrega MP3, o formato que o WhatsApp
 * sempre aceita (o MP4 do Safari e o WebM do Chrome são recusados pela Meta). Conversa da equipe: MediaRecorder, como antes.
 */
function Gravador({ onPronto, onCancelar, mp3 = false }: { onPronto: (b: Blob, mime: string, seg: number) => void; onCancelar: () => void; mp3?: boolean }) {
    const [seg, setSeg] = useState(0);
    const [erro, setErro] = useState("");
    const [preparando, setPreparando] = useState(false);
    const rec = useRef<MediaRecorder | null>(null);
    const gravMp3 = useRef<GravadorMp3 | null>(null);
    const partes = useRef<Blob[]>([]);
    const inicio = useRef(Date.now());
    const cancelado = useRef(false);
    const pararMp3Ref = useRef<() => void>(() => {});
    useEffect(() => {
        if (!mp3) return;
        let stream: MediaStream | null = null;
        let t: ReturnType<typeof setInterval> | null = null;
        navigator.mediaDevices?.getUserMedia({ audio: true }).then(async (s) => {
            stream = s;
            const g = new GravadorMp3();
            await g.iniciar(s);
            gravMp3.current = g;
            inicio.current = Date.now();
            t = setInterval(() => {
                const s2 = Math.round((Date.now() - inicio.current) / 1000);
                setSeg(s2);
                if (s2 >= 300) pararMp3(); // limite de 5 minutos
            }, 500);
        }).catch(() => setErro("Sem acesso ao microfone. Libere o microfone para o app nas configurações do aparelho."));
        const pararMp3 = async () => {
            const g = gravMp3.current;
            if (!g) return;
            gravMp3.current = null;
            if (t) clearInterval(t);
            stream?.getTracks().forEach((tr) => tr.stop());
            if (cancelado.current) {
                await g.parar(true);
                return;
            }
            setPreparando(true);
            try {
                const b = await g.parar();
                if (b) onPronto(b, "audio/mpeg", Math.round((Date.now() - inicio.current) / 1000));
            } catch (e: any) {
                setPreparando(false);
                setErro(e?.message || "Não foi possível preparar o áudio.");
            }
        };
        pararMp3Ref.current = pararMp3;
        return () => {
            if (t) clearInterval(t);
            if (gravMp3.current) {
                cancelado.current = true;
                gravMp3.current.parar(true);
                gravMp3.current = null;
            }
            stream?.getTracks().forEach((tr) => tr.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (mp3) return;
        const mime = formatoAudio();
        let stream: MediaStream | null = null;
        let t: ReturnType<typeof setInterval> | null = null;
        navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => {
            stream = s;
            const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
            rec.current = r;
            r.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
            r.onstop = () => {
                stream?.getTracks().forEach((tr) => tr.stop());
                if (cancelado.current) return;
                const tipo = (r.mimeType || mime || "audio/webm").split(";")[0];
                onPronto(new Blob(partes.current, { type: tipo }), tipo, Math.round((Date.now() - inicio.current) / 1000));
            };
            r.start();
            inicio.current = Date.now();
            t = setInterval(() => {
                const s2 = Math.round((Date.now() - inicio.current) / 1000);
                setSeg(s2);
                if (s2 >= 300 && r.state === "recording") r.stop(); // limite de 5 minutos
            }, 500);
        }).catch(() => setErro("Sem acesso ao microfone. Libere o microfone para o app nas configurações do aparelho."));
        return () => {
            if (t) clearInterval(t);
            if (rec.current?.state === "recording") {
                cancelado.current = true;
                rec.current.stop();
            }
            stream?.getTracks().forEach((tr) => tr.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const parar = () => (mp3 ? pararMp3Ref.current() : rec.current?.state === "recording" && rec.current.stop());
    const cancelar = () => {
        cancelado.current = true;
        if (mp3) pararMp3Ref.current();
        else if (rec.current?.state === "recording") rec.current.stop();
        onCancelar();
    };
    return (
        <div className="flex min-h-[54px] flex-1 items-center gap-3 rounded-full bg-white px-4 py-1.5 shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">
            {erro ? <span className="flex-1 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</span> : (
                <>
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#B42318]" aria-hidden="true" />
                    <span className="flex-1 text-sm font-extrabold text-[#313C55] dark:text-white">{preparando ? "Preparando áudio…" : `Gravando ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`}</span>
                </>
            )}
            <button type="button" onClick={cancelar} className="rounded-lg px-3 py-1.5 text-sm font-bold text-[#5B6478] hover:bg-white dark:text-[#AEB9CF] dark:hover:bg-[#232B3F]">Cancelar</button>
            {!erro && !preparando && <button type="button" onClick={parar} className="rounded-lg bg-[#313C55] px-3 py-1.5 text-sm font-extrabold text-white dark:bg-[#3D6A99]">Enviar</button>}
        </div>
    );
}

/* ---------------- modelos (janela de 24 h fechada) ---------------- */
function EscolherModelo({ onEnviar, conversaId }: { onEnviar: (m: { nome: string; idioma: string; parametros: string[]; texto: string }) => void; conversaId?: number }) {
    const [lista, setLista] = useState<any[] | null>(null);
    const [erro, setErro] = useState("");
    const [sel, setSel] = useState<any>(null);
    const [params, setParams] = useState<string[]>([]);
    useEffect(() => {
        msgGet<any[]>("modelos").then(setLista).catch((e) => setErro(e.message));
    }, []);
    if (erro) return <div className="text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</div>;
    if (!lista) return <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Carregando modelos…</div>;
    if (!lista.length) return <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum modelo aprovado na Meta.</div>;
    const texto = sel ? sel.corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_: string, n: string) => params[Number(n) - 1] || `{{${n}}}`) : "";
    return (
        <div className="flex flex-col gap-2">
            <select className="h-11 rounded-xl border border-[#E1E5EC] bg-white px-3 text-sm font-bold dark:border-white/12 dark:bg-[#232B3F]" value={sel?.nome || ""} onChange={(e) => { const m = lista.find((x) => x.nome === e.target.value); setSel(m); setParams(Array(m?.parametros || 0).fill("")); }} aria-label="Modelo">
                <option value="">Escolha um modelo aprovado</option>
                {lista.map((m) => <option key={m.nome + m.idioma} value={m.nome}>{m.nome} ({m.idioma})</option>)}
            </select>
            {sel && (
                <>
                    <ModeloCampos modelo={sel} conversaId={conversaId} params={params} onParams={setParams} compacto />
                    <div className="whitespace-pre-wrap rounded-xl bg-[#F6F8FB] p-3 text-sm dark:bg-[#1C2334]">{texto}</div>
                    <button type="button" disabled={params.some((p) => !p.trim())} onClick={() => onEnviar({ nome: sel.nome, idioma: sel.idioma, parametros: params, texto })} className="h-11 rounded-xl bg-[#313C55] text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]">Enviar modelo</button>
                </>
            )}
        </div>
    );
}

/* ---------------- janela da conversa ---------------- */
export default function JanelaConversa(props: {
    conversa: TConversa;
    mensagens: Mensagem[];
    perfil: Perfil;
    temMais: boolean;
    digitando: string;
    seguranca: boolean;
    /** conversa individual: "online" ou "visto por último …" do colega */
    presenca?: string;
    online?: boolean;
    onVoltar: () => void;
    onCarregarMais: () => void;
    onEnviarTexto: (t: string) => void;
    onEnviarModelo: (m: { nome: string; idioma: string; parametros: string[]; texto: string }) => void;
    onEnviarArquivo: (f: File | Blob, opcoes?: { mime?: string; duracao_s?: number }) => void;
    onAbrirCliente?: () => void;
    painelClienteAberto?: boolean;
    textoParaInserir?: { texto: string; n: number };
    onApagar: (m: Mensagem) => void;
    /** responder direcionado: mensagem escolhida (ou null) */
    respondendo?: Mensagem | null;
    onResponder?: (m: Mensagem | null) => void;
    /** pacote 3: reações, encaminhar, nota interna, localização, contato e salvar contato */
    onReagir?: (m: Mensagem, emoji: string) => void;
    onEncaminhar?: (m: Mensagem) => void;
    onEnviarNota?: (t: string) => void;
    onEnviarLocalizacao?: () => void;
    onPedirContato?: () => void;
    onSalvarContato?: () => void;
    /** pacote 4A: abrir as etiquetas da conversa */
    onEtiquetas?: () => void;
    /** mensagens fixadas no topo (até 3) e fixar/desafixar */
    fixadas?: Mensagem[];
    onFixarMensagem?: (m: Mensagem, fixar: boolean) => void;
    /** celular com o teclado aberto: a barra de digitação encosta no teclado; fechado, fica acima da barra do iPhone */
    tecladoAberto?: boolean;
    onDigitando: () => void;
    onAssumir: () => void;
    onTransferir: () => void;
    onEncerrar: () => void;
    onSilenciar: () => void;
    onDetalhes: () => void;
}) {
    const { conversa: c, mensagens, perfil } = props;
    const [texto, setTexto] = useState("");
    // pacote 5B: o painel do cliente fica na página (terceira coluna ou por cima); o texto de cobrança volta por aqui
    const abrirCliente = () => props.onAbrirCliente?.();
    const [orcIa, setOrcIa] = useState(false); // orçamento preparado pela Aurora (19/10/2026)
    useEffect(() => {
        if (props.textoParaInserir?.texto) setTexto(props.textoParaInserir.texto);
    }, [props.textoParaInserir?.n]); // eslint-disable-line react-hooks/exhaustive-deps
    const [modoNota, setModoNota] = useState(false);
    const [menuAnexar, setMenuAnexar] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const [termo, setTermo] = useState("");
    const [atual, setAtual] = useState(0);
    const [fixadaAtual, setFixadaAtual] = useState(0);
    const [emoji, setEmoji] = useState(false);
    const [catEmoji, setCatEmoji] = useState("Rostos");
    const [gravando, setGravando] = useState(false);
    const fim = useRef<HTMLDivElement>(null);
    const caixa = useRef<HTMLDivElement>(null);
    // a conversa continua no fim quando a área muda de tamanho (painel do cliente abrindo, teclado, faixa de 24 h)
    useEffect(() => {
        const el = caixa.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let noFim = true;
        const aoRolar = () => {
            noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        };
        el.addEventListener("scroll", aoRolar, { passive: true });
        const ro = new ResizeObserver(() => {
            if (noFim) el.scrollTop = el.scrollHeight;
        });
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", aoRolar);
            ro.disconnect();
        };
    }, []);
    const arquivo = useRef<HTMLInputElement>(null);
    const campo = useRef<HTMLTextAreaElement>(null);
    // faixa da janela de 24 h: recolhe para um selo pequeno; a escolha fica guardada neste aparelho
    const [janelaRecolhida, setJanelaRecolhida] = useState(false);
    useEffect(() => {
        try {
            setJanelaRecolhida(localStorage.getItem("pai.msg.janela24h.recolhida") === "1");
        } catch {
            /* sem armazenamento */
        }
    }, []);
    const recolherJanela = (v: boolean) => {
        setJanelaRecolhida(v);
        try {
            localStorage.setItem("pai.msg.janela24h.recolhida", v ? "1" : "0");
        } catch {
            /* sem armazenamento */
        }
    };
    const camera = useRef<HTMLInputElement>(null);
    const ultimoDig = useRef(0);
    const ultimoIdVisto = useRef(0);

    useEffect(() => {
        const ultimo = mensagens[mensagens.length - 1]?.id || 0;
        if (ultimo !== ultimoIdVisto.current) {
            const el = caixa.current;
            const perto = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 240 || ultimoIdVisto.current === 0;
            if (perto) fim.current?.scrollIntoView({ block: "end" });
            ultimoIdVisto.current = ultimo;
        }
    }, [mensagens]);
    useEffect(() => {
        ultimoIdVisto.current = 0;
        setTexto("");
        setEmoji(false);
        setGravando(false);
        setModoNota(false);
        setFixadaAtual(0);
        setBuscando(false);
        setTermo("");
    }, [c.id]);

    const externo = c.tipo === "externo";
    const janelaFechada = externo && !c.janela_aberta;
    const enviar = () => {
        const t = texto.trim();
        if (!t) return;
        if (modoNota) props.onEnviarNota?.(t);
        else props.onEnviarTexto(t);
        setTexto("");
        setEmoji(false);
    };
    const aoDigitar = (v: string) => {
        setTexto(v);
        if (Date.now() - ultimoDig.current > 3000) {
            ultimoDig.current = Date.now();
            props.onDigitando();
        }
    };

    let dia = "";
    let autorAnterior = "";
    const itens: React.ReactNode[] = [];
    const hoje = new Date().toLocaleDateString("pt-BR");
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("pt-BR");
    // busca na conversa (mensagens já carregadas), sem diferenciar acentos e maiúsculas
    const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const achados = buscando && termo.trim().length >= 2 ? mensagens.filter((m) => !m.apagada && normalizar(`${m.texto || ""} ${m.anexos.map((a) => a.nome_original || "").join(" ")}`).includes(normalizar(termo.trim()))).map((m) => m.id) : [];
    const idAtual = achados.length ? achados[Math.min(atual, achados.length - 1)] : 0;
    useEffect(() => {
        if (idAtual) document.getElementById(`msg-${idAtual}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [idAtual]);
    // só dá para responder onde se pode escrever (cliente: só o responsável, com a janela de 24 h aberta)
    const podeEscrever = c.participo !== false && (c.tipo !== "externo" || (!!c.posso_responder && !!c.janela_aberta));
    const porId = new Map(mensagens.map((x) => [x.id, x]));
    const fixadas = props.fixadas || [];
    const idsFixadas = fixadas.map((x) => x.id);
    const responder = props.onResponder ? (m: Mensagem) => { props.onResponder!(m); setTimeout(() => campo.current?.focus(), 50); } : undefined;
    mensagens.forEach((m) => {
        const d = new Date(m.criado_em).toLocaleDateString("pt-BR");
        if (d !== dia) {
            dia = d;
            autorAnterior = "";
            itens.push(<div key={`d${m.id}`} className="my-2 self-center rounded-lg bg-white px-3 py-1 text-[13.5px] font-extrabold uppercase text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F] dark:text-[#AEB9CF]">{d === hoje ? "Hoje" : d === ontem ? "Ontem" : d}</div>);
        }
        const autor = m.autor_tipo === "sistema" ? "" : `${m.autor_tipo}:${m.autor_usuario_id ?? m.autor_contato_id ?? ""}`;
        itens.push(<Bolha key={m.cliente_uuid || m.id} m={m} conversa={c} eu={perfil.id} onApagar={props.onApagar} primeiraDoBloco={autor !== autorAnterior} citada={m.responde_a_id ? porId.get(m.responde_a_id) : null} onResponder={podeEscrever ? responder : undefined} onReagir={props.onReagir} onEncaminhar={props.onEncaminhar} destaque={m.id === idAtual ? "atual" : achados.includes(m.id) ? "outro" : null}
            onFixar={props.onFixarMensagem ? (x) => props.onFixarMensagem!(x, !idsFixadas.includes(x.id)) : undefined} fixada={idsFixadas.includes(m.id)} />);
        autorAnterior = autor;
    });

    const subtitulo = externo
        ? `${c.contato?.telefone || ""}${c.responsavel ? ` · Responsável: ${c.responsavel.nome}` : " · Na fila"}`
        : c.tipo === "grupo" ? `${c.membros.length} membros` : props.presenca || "";

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-x-hidden bg-[#EFEAE2] dark:bg-[#1C2334]">
            {props.seguranca && (
                <div className="flex items-center gap-2 bg-[#FCEFB4] px-4 py-1.5 text-[12.5px] font-extrabold text-[#5C4600] dark:bg-[#F2CB3F]/15 dark:text-[#F7E39A]" role="status">
                    <Icone nome="wifi" className="h-4 w-4" />Sem tempo real: atualizando a cada 5 segundos.
                </div>
            )}
            <div className="flex items-center gap-2 border-b border-[#E6E9EE] bg-white py-2 pl-0.5 pr-1 md:gap-3 md:px-4 dark:border-white/12 dark:bg-[#232B3F]">
                <button type="button" onClick={props.onVoltar} className="flex h-11 w-10 flex-none items-center justify-center text-[#313C55] md:hidden dark:text-white" aria-label="Voltar às conversas"><Icone nome="back" className="h-6 w-6" /></button>
                <Avatar conversa={c} tamanho={40} online={!!props.online} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-[19px] font-extrabold text-[#1F2638] md:text-[17px] dark:text-white" title={c.titulo}>{c.titulo}</span>
                        {externo && <span title="Cliente do WhatsApp" aria-label="WhatsApp" className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]"><Icone nome="phone" className="h-3 w-3" /></span>}
                    </div>
                    <div className="truncate text-[14.5px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">{props.digitando ? <span className="font-bold text-[#4E6B0A] dark:text-[#B3CE52]">{c.tipo === "grupo" ? `${props.digitando.split(" ")[0]} está digitando…` : "digitando…"}</span> : subtitulo}</div>
                </div>
                <button type="button" onClick={() => { setBuscando((v) => !v); setTermo(""); setAtual(0); }} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Buscar nesta conversa" title="Buscar"><Icone nome="search" /></button>
                {externo && (
                    <button type="button" onClick={abrirCliente} aria-pressed={!!props.painelClienteAberto} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Cliente na Unymos (contrato e parcelas)" title="Cliente · contrato e parcelas"><Icone nome="user" /></button>
                )}
                {externo && props.onEtiquetas && (
                    <button type="button" onClick={props.onEtiquetas} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Etiquetas da conversa" title="Etiquetas"><Icone nome="tag" /></button>
                )}
                {externo && props.onSalvarContato && (
                    <button type="button" onClick={props.onSalvarContato} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label={c.contato?.salvo ? "Editar nome do contato" : "Salvar contato"} title={c.contato?.salvo ? "Editar contato" : "Salvar contato"}><Icone nome={c.contato?.salvo ? "editar" : "contato"} /></button>
                )}
                {externo && c.status_atendimento === "aguardando" && perfil.atendente && (
                    <button type="button" onClick={props.onAssumir} className="h-10 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white dark:bg-[#3D6A99]">Assumir</button>
                )}
                {externo && c.status_atendimento === "em_atendimento" && (c.posso_responder || perfil.gestao) && (
                    <>
                        <button type="button" onClick={props.onTransferir} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white" aria-label="Transferir conversa"><Icone nome="transf" className="h-[18px] w-[18px]" /><span className="hidden 2xl:inline">Transferir</span></button>
                        <button type="button" onClick={props.onEncerrar} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white" aria-label="Encerrar atendimento"><Icone nome="ok" className="h-[18px] w-[18px]" /><span className="hidden 2xl:inline">Encerrar</span></button>
                    </>
                )}
                {!externo && (
                    <>
                        <button type="button" onClick={props.onSilenciar} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label={c.silenciada ? "Voltar a notificar" : "Silenciar conversa"} title={c.silenciada ? "Silenciada" : "Silenciar"}><Icone nome={c.silenciada ? "belloff" : "bell"} /></button>
                        {c.tipo === "grupo" && <button type="button" onClick={props.onDetalhes} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Detalhes do grupo"><Icone nome="info" /></button>}
                    </>
                )}
            </div>
            {externo && c.orcamento_ia && (
                <button type="button" onClick={() => setOrcIa(true)} className="flex w-full items-center gap-2 border-b border-[#3D6A99] bg-[#E9EFF6] px-4 py-2 text-left text-[14.5px] font-extrabold text-[#1E3A5C] hover:bg-[#DDE7F3] dark:bg-[#3D6A99]/25 dark:text-[#DDE7F3]">
                    <span className="flex-1">📝 A Aurora preparou um orçamento para esta família — conferir e enviar</span><span aria-hidden="true">›</span>
                </button>
            )}
            {orcIa && <OrcamentoAurora conversaId={c.id} onFechar={() => setOrcIa(false)} onUsar={(t) => { setTexto(t); setOrcIa(false); }} />}
            {externo && (c.setor || (c.etiquetas && c.etiquetas.length > 0) || (c.contato?.contratos || []).length > 0) && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#E6E9EE] bg-white px-3 py-1.5 dark:border-white/12 dark:bg-[#232B3F]">
                    {(c.contato?.contratos || []).filter((k, i, todos) => todos.findIndex((x) => x.contrato.replace(/^0+/, "") === k.contrato.replace(/^0+/, "")) === i).slice(0, 2).map((k) => (
                        <React.Fragment key={k.contrato}>
                            {k.plano && <SeloUnymos t={k.tags.find((t) => t.nome.toUpperCase() === k.plano.toUpperCase()) || { nome: k.plano, cor: "#313C55" }} pequeno />}
                            <button type="button" onClick={abrirCliente} title="Abrir o contrato na Unymos" className={`inline-flex h-[22px] flex-none items-center gap-1 rounded-full border px-2 text-[12px] font-extrabold ${/ATIV/i.test(k.situacao) || !k.situacao ? "border-[#3D6A99] text-[#1E3A5C] dark:border-[#A9BED6] dark:text-[#DDE7F3]" : "border-[#B42318] text-[#B42318] dark:border-[#FF9C92] dark:text-[#FF9C92]"}`}>
                                📄 {k.contrato}{k.situacao && !/ATIV/i.test(k.situacao) ? ` · ${k.situacao}` : ""}
                            </button>
                        </React.Fragment>
                    ))}
                    {c.setor && <SeloCor nome={c.setor.nome} cor={c.setor.cor} ponto pequeno />}
                    <SelosEtiquetas etiquetas={c.etiquetas} max={6} />
                    {/* etiquetas de aditivos da Unymos ficam só no painel do cliente (à direita) */}
                </div>
            )}
            {fixadas.length > 0 && (() => {
                const f = fixadas[Math.min(fixadaAtual, fixadas.length - 1)];
                return (
                    <div className="flex items-center gap-2 border-b border-[#E6E9EE] bg-white py-1 pl-3 pr-1 dark:border-white/12 dark:bg-[#232B3F]">
                        <span className="flex flex-col gap-0.5 self-stretch py-1.5" aria-hidden="true">
                            {fixadas.map((x, i) => <span key={x.id} className={`w-[3px] flex-1 rounded-full ${i === Math.min(fixadaAtual, fixadas.length - 1) ? "bg-[#3D6A99] dark:bg-[#A9BED6]" : "bg-[#C9D1DE] dark:bg-white/20"}`} />)}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                document.getElementById(`msg-${f.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
                                setFixadaAtual((i) => (i + 1) % fixadas.length); // toque seguinte mostra a próxima, como no WhatsApp
                            }}
                            className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 text-left"
                            aria-label={`Mensagem fixada: ${previa(f)}. Ir para a mensagem`}
                        >
                            <Icone nome="pin" className="h-[18px] w-[18px] flex-none text-[#5B6478] dark:text-[#AEB9CF]" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{fixadas.length > 1 ? `Fixada ${Math.min(fixadaAtual, fixadas.length - 1) + 1} de ${fixadas.length}` : "Mensagem fixada"}</span>
                                <span className="block truncate text-[15px] text-[#1F2638] dark:text-white">{previa(f)}</span>
                            </span>
                        </button>
                        {props.onFixarMensagem && <button type="button" onClick={() => props.onFixarMensagem!(f, false)} className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#5B6478] hover:bg-black/5 dark:text-[#AEB9CF]" aria-label="Desafixar esta mensagem" title="Desafixar"><Icone nome="x" className="h-4 w-4" /></button>}
                    </div>
                );
            })()}
            {buscando && (
                <BarraBusca
                    termo={termo}
                    setTermo={(t) => { setTermo(t); setAtual(0); }}
                    total={achados.length}
                    atual={Math.min(atual, Math.max(0, achados.length - 1))}
                    temMais={props.temMais}
                    onAnterior={() => setAtual((a) => (achados.length ? (a - 1 + achados.length) % achados.length : 0))}
                    onProxima={() => setAtual((a) => (achados.length ? (a + 1) % achados.length : 0))}
                    onFechar={() => { setBuscando(false); setTermo(""); }}
                />
            )}
            {externo && c.status_atendimento !== "aguardando" && (janelaRecolhida ? (
                <button type="button" onClick={() => recolherJanela(false)} className={`mx-3 mt-1.5 flex items-center gap-1.5 self-end rounded-full px-2.5 py-1 text-[12.5px] font-bold shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] ${c.janela_aberta ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/15" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15"}`} aria-label="Mostrar a janela de 24 horas do WhatsApp">
                    <Icone nome="clock" className="h-4 w-4" />{c.janela_aberta ? "24 h" : "Janela fechada"}<Icone nome="chevron" className="h-3.5 w-3.5" />
                </button>
            ) : (
                <div className={`flex items-center gap-2 border-b border-[#E3E8F0] py-1.5 pl-4 pr-1.5 text-[13.5px] font-bold dark:border-white/12 ${c.janela_aberta ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/15" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15"}`} role="status">
                    <Icone nome="clock" className="h-[18px] w-[18px] flex-none" />
                    <span className="min-w-0 flex-1">{c.janela_aberta ? `Janela de 24 h aberta até ${new Date(c.janela_ate || "").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Janela de 24 h fechada: só modelos aprovados pela Meta"}</span>
                    <button type="button" onClick={() => recolherJanela(true)} className="flex h-9 w-9 flex-none items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label="Recolher aviso da janela de 24 horas" title="Recolher"><Icone nome="x" className="h-4 w-4" /></button>
                </div>
            ))}

            <div ref={caixa} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 md:px-4">
                {props.temMais && <button type="button" onClick={props.onCarregarMais} className="self-center rounded-full bg-white px-4 py-1.5 text-sm font-bold shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">Carregar mensagens anteriores</button>}
                {itens}
                <div ref={fim} />
            </div>

            {/* campo de envio */}
            {externo && !c.posso_responder && !modoNota ? (
                <div className="flex items-center gap-2 bg-[#F0F2F5] px-4 py-3 text-sm font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                    <Icone nome="lock" className="h-[18px] w-[18px] flex-none" />
                    <span className="flex-1">{c.status_atendimento === "aguardando" ? "Assuma o atendimento para responder ao cliente." : c.gestao_acompanha ? "Você vê esta conversa como Gestão: pode transferir ou encerrar, sem responder." : c.meu_papel === "observador" ? "Você acompanha esta conversa. Para responder, ela precisa ser transferida para você." : "Só o responsável pelo atendimento responde ao cliente."}</span>
                    {c.status_atendimento !== "aguardando" && props.onEnviarNota && (
                        <button type="button" onClick={() => setModoNota(true)} className="flex h-9 flex-none items-center gap-1.5 rounded-xl bg-[#FFF4C2] px-3 text-[13px] font-extrabold text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F7E39A]"><Icone nome="nota" className="h-4 w-4" />Nota interna</button>
                    )}
                </div>
            ) : janelaFechada && !modoNota ? (
                <div className="border-t border-[#E3E8F0] bg-white p-3 dark:border-white/12 dark:bg-[#232B3F]">
                    <EscolherModelo onEnviar={props.onEnviarModelo} conversaId={c.id} />
                    {props.onEnviarNota && <button type="button" onClick={() => setModoNota(true)} className="mt-2 flex h-9 items-center gap-1.5 rounded-xl bg-[#FFF4C2] px-3 text-[13px] font-extrabold text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F7E39A]"><Icone nome="nota" className="h-4 w-4" />Escrever nota interna</button>}
                </div>
            ) : (
                <>
                    {emoji && (
                        <div className="bg-white px-3 pb-1 pt-2 dark:bg-[#232B3F]" role="dialog" aria-label="Emojis">
                            <div className="mb-2 flex gap-1.5 overflow-x-auto">
                                {Object.keys(EMOJIS).map((k) => (
                                    <button key={k} type="button" onClick={() => setCatEmoji(k)} className={`h-[30px] whitespace-nowrap rounded-full px-3 text-[12.5px] font-extrabold ${catEmoji === k ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "bg-[#F1F4F8] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]"}`}>{k}</button>
                                ))}
                            </div>
                            <div className="grid grid-cols-8 gap-0.5 md:grid-cols-12">
                                {EMOJIS[catEmoji].map((e) => (
                                    <button key={e} type="button" onClick={() => setTexto((t) => t + e)} className="h-11 rounded-[10px] text-2xl hover:bg-[#EEF2F7] dark:hover:bg-white/10" aria-label={`Emoji ${e}`}>{e}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {modoNota && (
                        <div className="mx-2 -mb-0.5 mt-1.5 flex items-center gap-2 rounded-2xl bg-[#FFF4C2] px-3 py-1.5 text-[13.5px] font-extrabold text-[#5C4600] md:mx-4 dark:bg-[#4A3F12] dark:text-[#F7E39A]">
                            <Icone nome="nota" className="h-5 w-5 flex-none" />
                            <span className="flex-1">Nota interna: só a equipe vê{externo ? ", não vai para o cliente" : ""}.</span>
                            <button type="button" onClick={() => setModoNota(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" aria-label="Sair da nota interna"><Icone nome="x" className="h-4 w-4" /></button>
                        </div>
                    )}
                    {!modoNota && <SugestoesRespostas texto={texto} onEscolher={(t) => { setTexto(t); setTimeout(() => campo.current?.focus(), 30); }} />}
                    {props.respondendo && (
                        <div className="mx-2 -mb-0.5 mt-1.5 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] md:mx-4 dark:bg-[#232B3F]">
                            <Icone nome="responder" className="h-5 w-5 flex-none text-[#3D6A99] dark:text-[#A9BED6]" />
                            <div className="min-w-0 flex-1"><Citacao m={props.respondendo} eu={perfil.id} /></div>
                            <button type="button" onClick={() => props.onResponder?.(null)} className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#5B6478] hover:bg-black/5 dark:text-[#AEB9CF]" aria-label="Cancelar resposta"><Icone nome="x" className="h-5 w-5" /></button>
                        </div>
                    )}
                    <div className="flex items-end gap-1.5 px-2 pt-1.5 md:px-4 md:!pb-2" style={{ paddingBottom: props.tecladoAberto ? 8 : "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}>
                        {gravando ? (
                            <Gravador mp3={externo} onCancelar={() => setGravando(false)} onPronto={(b, mime, seg) => { setGravando(false); props.onEnviarArquivo(b, { mime, duracao_s: seg }); }} />
                        ) : (
                            <>
                                <div className="flex min-h-[54px] min-w-0 flex-1 items-end rounded-[27px] bg-white px-1.5 shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">
                                    <button type="button" onClick={() => setEmoji((v) => !v)} aria-pressed={emoji} className={`flex h-[54px] w-11 flex-none items-center justify-center ${emoji ? "text-[#313C55] dark:text-white" : "text-[#5B6478] dark:text-[#AEB9CF]"}`} aria-label="Emojis"><Icone nome="smile" className="h-[26px] w-[26px]" /></button>
                                    {/* 16 px: com menos, o iPhone dá zoom ao tocar no campo e a tela sai do lugar */}
                                    <textarea
                                        ref={campo}
                                        rows={1}
                                        value={texto}
                                        onPaste={(e) => {
                                            // colar imagem ou arquivo (print, foto copiada): envia como anexo; texto cola normalmente
                                            const arquivos = Array.from(e.clipboardData?.files || []);
                                            if (!arquivos.length) return;
                                            e.preventDefault();
                                            if (!perfil.midias) return;
                                            const pergunta = arquivos.length > 1 ? `Enviar os ${arquivos.length} arquivos colados?` : arquivos[0].type.startsWith("image/") ? "Enviar a imagem colada?" : `Enviar "${arquivos[0].name}"?`;
                                            if (window.confirm(pergunta)) arquivos.forEach((f) => props.onEnviarArquivo(f));
                                        }}
                                        onChange={(e) => aoDigitar(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); enviar(); } }}
                                        placeholder={modoNota ? "Nota interna" : externo ? "Responder pelo WhatsApp" : "Mensagem"}
                                        aria-label="Mensagem"
                                        className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-[13px] text-[18px] leading-7 text-[#1F2638] outline-none dark:text-white"
                                    />
                                    <div className="relative flex-none">
                                        <button type="button" onClick={() => setMenuAnexar((v) => !v)} aria-expanded={menuAnexar} className="flex h-[54px] w-11 items-center justify-center text-[#5B6478] dark:text-[#AEB9CF]" aria-label="Anexar: foto, documento, localização, contato ou nota" title="Anexar"><Icone nome="clip" className="h-[25px] w-[25px]" /></button>
                                        {menuAnexar && (
                                            <MenuAnexar
                                                onFechar={() => setMenuAnexar(false)}
                                                midias={perfil.midias}
                                                podeEnviar={!modoNota}
                                                onArquivo={() => arquivo.current?.click()}
                                                onLocalizacao={() => props.onEnviarLocalizacao?.()}
                                                onContato={() => props.onPedirContato?.()}
                                                onNota={() => { setModoNota(true); setTimeout(() => campo.current?.focus(), 30); }}
                                            />
                                        )}
                                    </div>
                                    {!texto.trim() && !modoNota && (
                                        <button type="button" onClick={() => camera.current?.click()} disabled={!perfil.midias} className="flex h-[54px] w-11 flex-none items-center justify-center text-[#5B6478] disabled:opacity-40 dark:text-[#AEB9CF]" aria-label="Tirar foto"><Icone nome="camera" className="h-[25px] w-[25px]" /></button>
                                    )}
                                    <input ref={arquivo} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,video/mp4" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) props.onEnviarArquivo(f); }} />
                                    <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) props.onEnviarArquivo(f); }} />
                                </div>
                                {texto.trim() || modoNota ? (
                                    <button type="button" onClick={enviar} className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-full bg-[#313C55] text-white dark:bg-[#3D6A99]" aria-label="Enviar"><Icone nome="send" /></button>
                                ) : (
                                    <button type="button" onClick={() => setGravando(true)} disabled={!perfil.midias || typeof MediaRecorder === "undefined"} className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-full bg-[#313C55] text-white disabled:opacity-40 dark:bg-[#3D6A99]" aria-label="Gravar áudio"><Icone nome="mic" /></button>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
