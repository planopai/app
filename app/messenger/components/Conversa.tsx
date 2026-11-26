"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE, apiJson, msgGet, msgPost } from "@/components/messenger/api";
import { formatoAudio, GravadorMp3 } from "@/components/messenger/compressao";
import type { Conversa as TConversa, Mensagem, Perfil, Anexo as TAnexo } from "@/components/messenger/tipos";
import { Avatar, CANAIS_CLIENTE, Icone, previa, SeloCor, SelosEtiquetas } from "./Lista";
import { BarraBusca, MenuAnexar, MenuMensagem, Reacoes, SugestoesRespostas } from "./Acoes";
import { SeloUnymos } from "./PainelCliente";
import SeletorModelo, { type EstadoModelo } from "@/components/messenger/SeletorModelo";
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

/**
 * 26/11/2026: texto da linha de baixo do topo da conversa ("visto por último…", telefone · responsável…).
 * Quando não cabe, rola da direita para a esquerda: fica parado 2 s, corre devagar até o fim, para 1,5 s e recomeça.
 * Se cabe, fica parado. Com "reduzir movimento" ligado no aparelho, fica cortado com "…", como antes.
 */
function TextoRolante({ texto, className = "" }: { texto: string; className?: string }) {
    const caixa = useRef<HTMLDivElement>(null);
    const conteudo = useRef<HTMLSpanElement>(null);
    const [sobra, setSobra] = useState(0);

    // mede quanto o texto passa da largura (e mede de novo quando a tela muda de tamanho)
    useEffect(() => {
        const cx = caixa.current;
        if (!cx) return;
        const medir = () => {
            const calmo = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            const s = Math.ceil(cx.scrollWidth - cx.clientWidth);
            setSobra(!calmo && s > 2 ? s : 0);
        };
        medir();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
        ro?.observe(cx);
        return () => ro?.disconnect();
    }, [texto]);

    // rola só quando não cabe
    useEffect(() => {
        const ct = conteudo.current;
        if (!ct || !sobra || typeof ct.animate !== "function") return;
        const parado = 2000, fim = 1500, corre = Math.max(1500, (sobra / 35) * 1000);
        const total = parado + corre + fim;
        const anim = ct.animate(
            [
                { transform: "translateX(0)", offset: 0 },
                { transform: "translateX(0)", offset: parado / total },
                { transform: `translateX(-${sobra}px)`, offset: (parado + corre) / total },
                { transform: `translateX(-${sobra}px)`, offset: 1 },
            ],
            { duration: total, iterations: Infinity, easing: "linear" },
        );
        return () => anim.cancel();
    }, [sobra, texto]);

    return (
        <div ref={caixa} className={`overflow-hidden whitespace-nowrap ${sobra ? "" : "text-ellipsis"} ${className}`} title={texto}>
            <span ref={conteudo} className={sobra ? "inline-block will-change-transform" : ""}>{texto}</span>
        </div>
    );
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

/**
 * 25/11/2026: visualizador de fotos como no WhatsApp — tela escura por cima de tudo, foto inteira no centro, quem enviou e
 * quando, legenda, setas (e ← →) para passar pelas fotos da conversa, faixa de miniaturas embaixo, arrastar para o lado no
 * celular, clique na foto amplia no ponto clicado (clique de novo reduz), baixar, fechar no X, no fundo ou com Esc.
 * Abre pelo JanelaConversa (FotosContexto), acima de qualquer camada do app (antes, no computador, podia ficar por baixo).
 */
type FotoDaConversa = { a: TAnexo; m?: Mensagem };
const FotosContexto = React.createContext<((anexoId: number) => void) | null>(null);

function dataHoraFoto(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    const hoje = new Date().toDateString() === d.toDateString();
    const ontem = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${hoje ? "hoje" : ontem ? "ontem" : d.toLocaleDateString("pt-BR")} às ${hora}`;
}

function MiniaturaFoto({ a, ativa, onClick }: { a: TAnexo; ativa: boolean; onClick: () => void }) {
    const [u, setU] = useState("");
    useEffect(() => {
        let vivo = true;
        linkAnexo(a.id, a.tem_miniatura).then((x) => vivo && setU(x)).catch(() => {});
        return () => {
            vivo = false;
        };
    }, [a.id, a.tem_miniatura]);
    return (
        <button type="button" data-ativa={ativa ? "1" : "0"} onClick={onClick} aria-label="Ver esta foto" aria-current={ativa}
            className={`h-14 w-14 flex-none overflow-hidden rounded-lg bg-white/10 transition ${ativa ? "ring-2 ring-[#B3CE52]" : "opacity-50 hover:opacity-90"}`}>
            {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : null}
        </button>
    );
}

function VisualizadorFoto({ fotos, inicial, titulo, eu, onFechar }: { fotos: FotoDaConversa[]; inicial: number; titulo?: string; eu?: number; onFechar: () => void }) {
    const [i, setI] = useState(() => Math.max(0, fotos.findIndex((f) => f.a.id === inicial)));
    const [urls, setUrls] = useState<Record<number, string>>({});
    const [falhou, setFalhou] = useState<Record<number, boolean>>({});
    const [zoom, setZoom] = useState(false);
    const area = useRef<HTMLDivElement>(null);
    const tira = useRef<HTMLDivElement>(null);
    const toque = useRef<{ x: number; y: number } | null>(null);
    const total = fotos.length;
    const ir = React.useCallback((d: number) => {
        setZoom(false);
        setI((v) => Math.min(total - 1, Math.max(0, v + d)));
    }, [total]);
    // a foto atual e as vizinhas em tamanho original (as vizinhas já ficam prontas para passar)
    useEffect(() => {
        [i, i + 1, i - 1].forEach((k) => {
            const f = fotos[k];
            if (!f || urls[f.a.id] || falhou[f.a.id]) return;
            linkAnexo(f.a.id).then((u) => setUrls((x) => ({ ...x, [f.a.id]: u }))).catch(() => setFalhou((x) => ({ ...x, [f.a.id]: true })));
        });
    }, [i, fotos]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") onFechar();
            else if (e.key === "ArrowLeft") ir(-1);
            else if (e.key === "ArrowRight") ir(1);
        };
        document.addEventListener("keydown", tecla);
        const antes = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", tecla);
            document.body.style.overflow = antes;
        };
    }, [ir, onFechar]);
    useEffect(() => {
        tira.current?.querySelector<HTMLElement>('[data-ativa="1"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [i]);
    const atual = fotos[i];
    if (!atual || typeof document === "undefined") return null;
    const url = urls[atual.a.id];
    const m = atual.m;
    const autor = !m ? "" : m.autor_tipo === "usuario" && m.autor_usuario_id === eu ? "Você" : m.autor_nome || (m.autor_tipo === "contato" ? titulo || "" : "");
    const legenda = m?.texto && m.texto !== atual.a.nome_original ? m.texto : "";
    const ampliar = (e: React.MouseEvent<HTMLImageElement>) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const novo = !zoom;
        setZoom(novo);
        if (novo) {
            setTimeout(() => {
                const el = area.current;
                if (!el) return;
                el.scrollLeft = px * el.scrollWidth - el.clientWidth / 2;
                el.scrollTop = py * el.scrollHeight - el.clientHeight / 2;
            }, 30);
        }
    };
    const seta = "absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-0 md:flex";
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0B141A]/[0.97] text-white" role="dialog" aria-modal="true" aria-label="Foto">
            <div className="flex flex-none items-center gap-3 px-3 py-2 md:px-5" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15.5px] font-extrabold">{autor || atual.a.nome_original || "Foto"}</div>
                    <div className="truncate text-[12.5px] text-white/65">{[dataHoraFoto(m?.criado_em), total > 1 ? `${i + 1} de ${total}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
                <button type="button" onClick={() => setZoom((z) => !z)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={zoom ? "Reduzir" : "Ampliar"} title={zoom ? "Reduzir" : "Ampliar"}>
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" />{zoom ? null : <path d="M11 8v6" />}<path d="M8 11h6" /></svg>
                </button>
                <BotaoBaixar a={atual.a} claro />
                <button type="button" onClick={onFechar} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Fechar foto" title="Fechar (Esc)"><Icone nome="x" className="h-5 w-5" /></button>
            </div>
            <div className="relative min-h-0 flex-1">
                <button type="button" className={`${seta} left-3`} onClick={() => ir(-1)} disabled={i === 0} aria-label="Foto anterior">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
                </button>
                <button type="button" className={`${seta} right-3`} onClick={() => ir(1)} disabled={i >= total - 1} aria-label="Próxima foto">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                </button>
                <div
                    ref={area}
                    className={`absolute inset-0 ${zoom ? "overflow-auto" : "flex items-center justify-center overflow-hidden px-2 md:px-20"}`}
                    onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
                    onTouchStart={(e) => { if (!zoom && e.touches.length === 1) toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                    onTouchEnd={(e) => {
                        const t0 = toque.current;
                        toque.current = null;
                        if (!t0 || zoom) return;
                        const dx = e.changedTouches[0].clientX - t0.x;
                        const dy = e.changedTouches[0].clientY - t0.y;
                        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
                    }}
                >
                    {url ? (
                        <img
                            key={atual.a.id}
                            src={url}
                            alt={legenda || atual.a.nome_original || "Foto"}
                            draggable={false}
                            onClick={ampliar}
                            className={zoom ? "block max-w-none cursor-zoom-out select-none" : "max-h-full max-w-full cursor-zoom-in select-none object-contain shadow-2xl"}
                            style={zoom ? { width: "200%" } : undefined}
                        />
                    ) : (
                        <span className="text-sm font-bold text-white/80">{falhou[atual.a.id] ? "Foto indisponível" : "Carregando foto…"}</span>
                    )}
                </div>
            </div>
            {legenda ? <div className="mx-auto max-w-[760px] flex-none whitespace-pre-wrap break-words px-4 pb-2 pt-1 text-center text-[15px] text-white/90">{legenda}</div> : null}
            {total > 1 ? (
                <div ref={tira} className="flex flex-none gap-2 overflow-x-auto px-3 pb-3 pt-1 md:justify-center" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                    {fotos.map((f, k) => <MiniaturaFoto key={f.a.id} a={f.a} ativa={k === i} onClick={() => { setZoom(false); setI(k); }} />)}
                </div>
            ) : (
                <div className="flex-none" style={{ height: "max(12px, env(safe-area-inset-bottom))" }} />
            )}
        </div>,
        document.body
    );
}

/**
 * 24/11/2026: foto escolhida (clipe, câmera ou colada) fica numa janela antes de sair, como no WhatsApp:
 * prévia, legenda e a mensagem que está sendo respondida. Várias fotos: a legenda vai na primeira.
 */
function EnvioFoto({ fotos, respondendo, eu, onEnviar, onCancelar, onTirar }: { fotos: File[]; respondendo?: Mensagem | null; eu: number; onEnviar: (legenda: string) => void; onCancelar: () => void; onTirar: (i: number) => void }) {
    const [legenda, setLegenda] = useState("");
    const [atual, setAtual] = useState(0);
    const urls = React.useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
    useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCancelar(); };
        document.addEventListener("keydown", tecla);
        return () => document.removeEventListener("keydown", tecla);
    }, [onCancelar]);
    const i = Math.min(atual, fotos.length - 1);
    if (typeof document === "undefined" || !fotos.length) return null;
    return createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col bg-[#0B141A]" role="dialog" aria-modal="true" aria-label="Enviar foto">
            <div className="flex flex-none items-center gap-2 px-3 py-2 text-white" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
                <button type="button" onClick={onCancelar} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Cancelar envio"><Icone nome="x" className="h-5 w-5" /></button>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{fotos.length > 1 ? `${fotos.length} fotos` : "Enviar foto"}</span>
                {fotos.length > 1 && <button type="button" onClick={() => { onTirar(i); setAtual(0); }} className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-bold hover:bg-white/20" aria-label="Tirar esta foto"><Icone nome="trash" className="h-4 w-4" />Tirar</button>}
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-3">
                <img src={urls[i]} alt="Prévia da foto" className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
            {fotos.length > 1 && (
                <div className="flex flex-none justify-center gap-2 overflow-x-auto px-3 pb-2">
                    {urls.map((u, k) => (
                        <button key={u} type="button" onClick={() => setAtual(k)} className={`h-14 w-14 flex-none overflow-hidden rounded-lg ${k === i ? "ring-2 ring-[#B3CE52]" : "opacity-70"}`} aria-label={`Foto ${k + 1}`}><img src={u} alt="" className="h-full w-full object-cover" /></button>
                    ))}
                </div>
            )}
            <div className="flex-none px-3 pb-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                {respondendo && <div className="mb-2 rounded-xl bg-white/95 px-2 py-1 dark:bg-[#232B3F]"><Citacao m={respondendo} eu={eu} /></div>}
                <div className="flex items-end gap-2">
                    <textarea
                        autoFocus
                        rows={1}
                        value={legenda}
                        onChange={(e) => setLegenda(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); onEnviar(legenda); } }}
                        placeholder={fotos.length > 1 ? "Legenda (vai na primeira foto)" : "Adicione uma legenda…"}
                        aria-label="Legenda da foto"
                        className="max-h-32 min-h-[48px] flex-1 resize-none rounded-3xl bg-[#2A3942] px-4 py-3 text-[17px] text-white outline-none placeholder:text-white/50 md:text-[15.5px]"
                    />
                    <button type="button" onClick={() => onEnviar(legenda)} className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[#B3CE52] text-[#1F2638]" aria-label="Enviar foto"><Icone nome="send" className="h-5 w-5" /></button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Anexo({ a, minha }: { a: TAnexo; minha: boolean }) {
    const [verFoto, setVerFoto] = useState(false);
    const abrirNaConversa = React.useContext(FotosContexto); // 25/11/2026: abre no visualizador da conversa (com as outras fotos)
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
                <button type="button" onClick={(e) => { e.stopPropagation(); if (abrirNaConversa) abrirNaConversa(a.id); else setVerFoto(true); }} className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-[#F0F2F5] dark:bg-[#1C2334]" style={{ aspectRatio: a.largura && a.altura ? `${a.largura}/${a.altura}` : "4/3" }} aria-label="Abrir foto">
                    {url ? <img src={url} alt="Foto enviada" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-bold text-[#6B7488] dark:text-[#AEB9CF]">{erro ? "Foto indisponível" : "Carregando foto…"}</span>}
                </button>
                <span className="absolute right-1.5 top-1.5"><BotaoBaixar a={a} claro /></span>
                {verFoto && <VisualizadorFoto fotos={[{ a }]} inicial={a.id} onFechar={() => setVerFoto(false)} />}
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

/** Histórico da Mango (21/11/2026): conversas antigas do escritório e do plantão, só leitura. Servidor: aurora_15.php. */
type ResumoMango = { atendimentos: number; mensagens: number; de: string | null; ate: string | null };
type MsgMango = { autor: "cliente" | "equipe" | "automatico"; autor_nome: string | null; tipo: string; texto: string | null; em: string; numero: string };
type GrupoMango = { chave: string; numero: string; numero_nome: string; setor: string | null; encerrado_por: string | null; inicio: string; fim: string | null; avulsas?: boolean; mensagens: MsgMango[] };
async function mangoGet<T = any>(acao: string, params: Record<string, any> = {}): Promise<T> {
    const u = new URL(`${API_BASE}/aurora_15.php`);
    u.searchParams.set("action", acao);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    const j = await apiJson(u.toString());
    return j.dados as T;
}
const dataMango = (s: string | null, comHora = true) => {
    if (!s) return "";
    const [d, h] = s.split(" ");
    const [a, m, dia] = d.split("-");
    return `${dia}/${m}/${a}${comHora && h ? ` ${h.slice(0, 5)}` : ""}`;
};
const MIDIA_MANGO: Record<string, string> = { audio: "🎤 Áudio", imagem: "📷 Foto", video: "🎬 Vídeo", documento: "📄 Documento", figurinha: "Figurinha", localizacao: "📍 Localização", contato: "👤 Contato", ligacao: "📞 Ligação" };
const COR_NUMERO_MANGO: Record<string, string> = { escritorio: "#3D6A99", plantao: "#C2410C", financeiro: "#8A6A00", cobranca: "#6B4FA0", instagram: "#B23A7A" };

function HistoricoMango({ conversaId, resumo, onFechar }: { conversaId: number; resumo: ResumoMango | null; onFechar: () => void }) {
    const [grupos, setGrupos] = useState<GrupoMango[]>([]);
    const [etiquetas, setEtiquetas] = useState<{ nome: string; cor: string }[]>([]);
    const [antes, setAntes] = useState<string | null>(null);
    const [mais, setMais] = useState(false);
    const [abertos, setAbertos] = useState<Record<string, boolean>>({});
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const carregar = async (cursor: string | null) => {
        setCarregando(true);
        setErro("");
        try {
            const d = await mangoGet<{ etiquetas: { nome: string; cor: string }[]; grupos: GrupoMango[]; mais: boolean; antes: string | null }>("historico", { conversa_id: conversaId, antes: cursor, limite: 10 });
            setEtiquetas(d.etiquetas);
            setGrupos((g) => (cursor ? [...g, ...d.grupos] : d.grupos));
            if (!cursor && d.grupos[0]) setAbertos({ [d.grupos[0].chave]: true });
            setMais(d.mais);
            setAntes(d.antes);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setCarregando(false);
        }
    };
    useEffect(() => { carregar(null); }, [conversaId]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Histórico da Mango" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] text-[#1F2638] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white">
                <div className="flex items-start gap-3 border-b border-[#EEF0F3] bg-[#F4F8FC] px-5 py-4 dark:border-white/10 dark:bg-[#3D6A99]/15">
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#3D6A99] dark:text-[#A9BED6]">Histórico da Mango · só leitura</div>
                        {resumo && <div className="mt-1 text-[14.5px] font-bold">{resumo.atendimentos} atendimento(s){resumo.de ? ` · de ${dataMango(resumo.de, false)} a ${dataMango(resumo.ate, false)}` : ""}</div>}
                        {etiquetas.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{etiquetas.map((e) => <SeloCor key={e.nome} nome={e.nome} cor={e.cor} pequeno />)}</div>}
                    </div>
                    <button type="button" onClick={onFechar} className="flex h-10 w-10 flex-none items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label="Fechar o histórico da Mango" title="Fechar"><Icone nome="x" /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#EFEAE2] px-3 py-3 dark:bg-[#1C2334]">
                    {erro && <p className="my-2 rounded-xl bg-[#FDECEA] px-3 py-2 text-[14px] font-bold text-[#B42318]">{erro}</p>}
                    {!carregando && !erro && grupos.length === 0 && <p className="py-4 text-center text-[14.5px]">Nenhuma conversa antiga deste contato.</p>}
                    {grupos.map((g) => {
                        const aberto = !!abertos[g.chave];
                        return (
                            <div key={g.chave} className="mb-2 overflow-hidden rounded-2xl bg-white shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">
                                <button type="button" onClick={() => setAbertos((a) => ({ ...a, [g.chave]: !aberto }))} aria-expanded={aberto} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <b className="text-[14.5px]">{dataMango(g.inicio, !g.avulsas)}</b>
                                            <SeloCor nome={g.numero_nome} cor={COR_NUMERO_MANGO[g.numero] || "#3D6A99"} pequeno />
                                            {g.avulsas && <SeloCor nome="Fora de atendimento" cor="#5B6478" pequeno />}
                                        </span>
                                        <span className="block truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                            {[g.setor, g.encerrado_por ? `atendido por ${g.encerrado_por}` : "", `${g.mensagens.length} mensagem(ns)`].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                    <Icone nome={aberto ? "recolher" : "expandir"} className="h-4 w-4 flex-none" />
                                </button>
                                {aberto && (
                                    <div className="flex flex-col gap-1 border-t border-[#F0F2F5] bg-[#F7F4EF] px-3 py-3 dark:border-white/10 dark:bg-[#1C2334]">
                                        {g.mensagens.length === 0 && <p className="text-center text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">As mensagens deste atendimento entram na próxima importação da Mango.</p>}
                                        {g.mensagens.map((m, i) => {
                                            const conteudo = (
                                                <>
                                                    {m.tipo !== "texto" && <span className="block font-bold">{MIDIA_MANGO[m.tipo] || m.tipo}</span>}
                                                    {m.texto && <TextoFormatado texto={m.texto} />}
                                                </>
                                            );
                                            if (m.autor === "automatico") {
                                                return (
                                                    <div key={i} className="mx-auto my-1 max-w-[92%] rounded-xl bg-[#E9EDF2] px-3 py-2 text-[13px] text-[#4A5468] dark:bg-white/10 dark:text-[#C9D1DE]">
                                                        <span className="mb-0.5 block text-[11.5px] font-extrabold uppercase">{m.autor_nome || "Automática"} · {dataMango(m.em).slice(11)}</span>
                                                        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{conteudo}</div>
                                                    </div>
                                                );
                                            }
                                            const equipe = m.autor === "equipe";
                                            return (
                                                <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-[14.5px] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] ${equipe ? "self-end bg-[#E7F3D2] dark:bg-[#3A4A1E]" : "self-start bg-white dark:bg-[#2C354B]"}`}>
                                                    {equipe && <span className="block text-[12px] font-extrabold text-[#4E6B0A] dark:text-[#B3CE52]">{m.autor_nome || "Equipe"}</span>}
                                                    <div className="whitespace-pre-wrap break-words">{conteudo}</div>
                                                    <span className="mt-0.5 block text-right text-[11.5px] text-[#5B6478] dark:text-[#AEB9CF]">{dataMango(m.em).slice(11)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {carregando && <p className="py-3 text-center text-[14px]">Carregando…</p>}
                    {mais && !carregando && <button type="button" onClick={() => carregar(antes)} className="mx-auto my-2 block h-11 rounded-xl border border-[#C9D1DE] bg-white px-5 text-[14.5px] font-extrabold text-[#313C55] dark:bg-[#232B3F] dark:text-white">Carregar atendimentos mais antigos</button>}
                </div>
                <p className="border-t border-[#E1E5EC] bg-[#F6F8FB] px-5 py-2 text-[12.5px] text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">Conversas importadas da Mango (escritório, plantão e canais antigos). Fotos, áudios e documentos não foram trazidos.</p>
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
/**
 * 25/11/2026: cor fixa de cada pessoa nas conversas (nome, citação e iniciais), como no WhatsApp — a mesma pessoa tem
 * sempre a mesma cor. Cada par é [tema claro, tema escuro], com contraste para ler nos dois.
 */
const CORES_PESSOAS: [string, string][] = [
    ["#2563EB", "#7FB2FF"], ["#C2410C", "#FFA36B"], ["#7C3AED", "#C4A5FF"], ["#047857", "#5EE0B0"], ["#B91C1C", "#FF8A8A"],
    ["#0E7490", "#67D8EE"], ["#A16207", "#F5C451"], ["#BE185D", "#FF8CC6"], ["#4D7C0F", "#B3E15C"], ["#4338CA", "#A5B0FF"],
];
function corDaPessoa(m: Pick<Mensagem, "autor_usuario_id" | "autor_contato_id" | "autor_nome">): [string, string] {
    const chave = m.autor_usuario_id ? `u${m.autor_usuario_id}` : m.autor_contato_id ? `c${m.autor_contato_id}` : `n${m.autor_nome || ""}`;
    let h = 0;
    for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
    return CORES_PESSOAS[h % CORES_PESSOAS.length];
}
/** style com as variáveis --cor-c (claro) e --cor-e (escuro), para usar com text-[var(--cor-c)] dark:text-[var(--cor-e)]. */
function estiloCor(c: [string, string]): React.CSSProperties {
    return { ["--cor-c" as string]: c[0], ["--cor-e" as string]: c[1] } as React.CSSProperties;
}
function iniciais(nome?: string | null) {
    const p = (nome || "").trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function Citacao({ m, eu }: { m: Mensagem | null | undefined; eu: number }) {
    const autor = !m ? "" : m.autor_tipo === "usuario" && m.autor_usuario_id === eu ? "Você" : m.autor_nome || "—";
    const cor = m && autor !== "Você" && m.autor_tipo !== "sistema" ? corDaPessoa(m) : null;
    return (
        <div style={cor ? estiloCor(cor) : undefined} className={`mb-1 rounded-md border-l-4 bg-black/5 px-2.5 py-1.5 text-[14px] dark:bg-white/10 ${cor ? "border-[var(--cor-c)] dark:border-[var(--cor-e)]" : "border-[#3D6A99] dark:border-[#A9BED6]"}`}>
            <div className={`font-extrabold ${cor ? "text-[var(--cor-c)] dark:text-[var(--cor-e)]" : "text-[#3D6A99] dark:text-[#A9BED6]"}`}>{autor || "Mensagem"}</div>
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

/** 23/11/2026: segundos que faltam para o pacote de textos do WhatsApp sair. */
function ContagemEnvio({ ate }: { ate: number }) {
    const [agora, setAgora] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setAgora(Date.now()), 250);
        return () => clearInterval(t);
    }, []);
    const seg = Math.max(0, Math.ceil((ate - agora) / 1000));
    return <span className="font-extrabold text-[#8A6A00] dark:text-[#F7E39A]">{seg > 0 ? `envia em ${seg} s` : "enviando…"}</span>;
}

/** 23/11/2026: nota da Aurora (encaminhamento) recolhida: mostra o título e o resumo; o resto abre no "Ver detalhes". */
function NotaAurora({ texto }: { texto: string }) {
    const [aberta, setAberta] = useState(false);
    const linhas = texto.split("\n").filter((l) => l.trim() !== "");
    const resumo = linhas.find((l) => /^resumo\s*:/i.test(l.trim()));
    if (linhas.length <= 3) return <span className="whitespace-pre-wrap break-words"><TextoFormatado texto={texto} /></span>;
    return (
        <span className="block">
            {aberta ? (
                <span className="whitespace-pre-wrap break-words"><TextoFormatado texto={texto} /></span>
            ) : (
                <>
                    <span className="block font-extrabold"><TextoFormatado texto={linhas[0]} /></span>
                    <span className="mt-0.5 block whitespace-pre-wrap break-words"><TextoFormatado texto={resumo || linhas.slice(1, 3).join("\n")} /></span>
                </>
            )}
            <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="mt-1 text-[13px] font-extrabold text-[#8A6A00] underline-offset-2 hover:underline dark:text-[#F7E39A]">{aberta ? "Recolher" : "Ver detalhes"}</button>
        </span>
    );
}

function Bolha({ m, conversa, eu, onApagar, primeiraDoBloco, citada, onResponder, onReagir, onEncaminhar, destaque, onFixar, fixada, onEnviarAgora, onCancelarEnvio }: { m: Mensagem; conversa: TConversa; eu: number; onApagar: (m: Mensagem) => void; primeiraDoBloco: boolean; citada?: Mensagem | null; onResponder?: (m: Mensagem) => void; onReagir?: (m: Mensagem, emoji: string) => void; onEncaminhar?: (m: Mensagem) => void; destaque?: "atual" | "outro" | null; onFixar?: (m: Mensagem) => void; fixada?: boolean; onEnviarAgora?: () => void; onCancelarEnvio?: () => void }) {
    const [puxar, setPuxar] = useState(0);
    const [menu, setMenu] = useState(false);
    const [dados, setDados] = useState(false); // "Dados da mensagem": quem leu e quem reagiu
    const toqueLongo = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toque = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
    const automatica = m.autor_tipo === "sistema" && m.tipo !== "sistema"; // pacote 4B: boas-vindas, menu, fora do horário, avaliação
    if (m.autor_tipo === "sistema" && !automatica) {
        return <div className="my-1 self-center rounded-lg bg-white/90 px-3 py-1 text-center text-[14px] font-bold text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F] dark:text-[#AEB9CF]">{m.texto}</div>;
    }
    // 23/11/2026: na conversa com cliente, toda a equipe fica à direita (junto com a Aurora) e o cliente à esquerda
    const daEquipe = conversa.tipo === "externo" && m.autor_tipo === "usuario" && m.autor_usuario_id !== eu;
    const minha = (m.autor_tipo === "usuario" && m.autor_usuario_id === eu) || automatica || daEquipe;
    const hora = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let leitura: React.ReactNode = null;
    if (minha && !m.apagada) {
        if (m._aguardando) leitura = <ContagemEnvio ate={m._aguardando} />;
        else if (m._enviando) leitura = <Tiques estado="enviando" />;
        else if (m._falhaLocal) leitura = <span className="font-extrabold text-[#B42318] dark:text-[#FF9C92]">Não enviada</span>;
        else if (conversa.tipo === "externo" || conversa.tipo === "parceiro") { // 25/11/2026: WhatsApp Web também mostra enviada/entregue/lida/Falhou
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
    // 25/11/2026: cor fixa da pessoa; no grupo, iniciais ao lado do bloco; "biquinho" na primeira bolha de cada bloco
    const cor = corDaPessoa(m);
    const comAvatar = conversa.tipo === "grupo" && !minha;
    const corBolha = m.interna ? null : minha ? "border-r-[#E3EFC0] dark:border-r-[#3D6A99]" : "border-r-white dark:border-r-[#232B3F]";
    return (
        <div
            id={`msg-${m.id}`}
            // no celular o toque longo abre o menu sem selecionar o texto (copiar fica no menu); no computador dá para selecionar
            className={`group relative max-w-[85%] select-none md:max-w-[68%] md:select-text ${minha ? "self-end" : "self-start"} ${comAvatar ? "ml-10" : ""} ${primeiraDoBloco ? "mt-3" : ""} ${destaque === "atual" ? "rounded-[12px] ring-2 ring-[#F2CB3F] ring-offset-2 ring-offset-transparent" : ""}`}
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
            {comAvatar && primeiraDoBloco && (
                <span aria-hidden="true" className="absolute -left-10 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ background: cor[0] }}>{iniciais(m.autor_nome)}</span>
            )}
            {primeiraDoBloco && corBolha && (
                <span aria-hidden="true" className={`absolute top-0 h-0 w-0 border-b-[10px] border-b-transparent ${minha ? `-right-[7px] border-l-[8px] ${corBolha.replace(/border-r-/g, "border-l-")}` : `-left-[7px] border-r-[8px] ${corBolha}`}`} />
            )}
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
                {(!minha || daEquipe) && conversa.tipo !== "individual" && primeiraDoBloco && <div style={estiloCor(cor)} className="mb-0.5 text-[14.5px] font-extrabold text-[var(--cor-c)] dark:text-[var(--cor-e)]">{m.autor_nome || "—"}</div>}
                {m.apagada ? (
                    <span className="italic text-[#6B7488] dark:text-[#C9D1DE]">Mensagem apagada</span>
                ) : (
                    <>
                        {m.responde_a_id ? <Citacao m={citada} eu={eu} /> : null}
                        {m.anexos.map((a) => <Anexo key={a.id} a={a} minha={minha} />)}
                        {m.texto && m.tipo !== "audio" && (m.interna && m.texto.trim().startsWith("🤖") ? <NotaAurora texto={m.texto} /> : <span className="whitespace-pre-wrap break-words"><TextoFormatado texto={m.texto} /></span>)}
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
            {m._aguardando && (onEnviarAgora || onCancelarEnvio) && (
                <div className="mt-1 flex justify-end gap-1.5">
                    {onCancelarEnvio && <button type="button" onClick={onCancelarEnvio} className="h-8 rounded-full bg-white px-3 text-[13px] font-bold text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] hover:bg-[#F0F2F5] dark:bg-[#232B3F] dark:text-[#AEB9CF]">Cancelar</button>}
                    {onEnviarAgora && <button type="button" onClick={onEnviarAgora} className="h-8 rounded-full bg-[#313C55] px-3 text-[13px] font-extrabold text-white dark:bg-[#3D6A99]">Enviar agora</button>}
                </div>
            )}
        </div>
    );
}

/* ---------------- gravador de áudio ---------------- */
/**
 * 25/11/2026: mensagem certa para cada falha do microfone (antes, qualquer erro virava "sem acesso", mesmo sem microfone
 * ligado no computador ou com ele ocupado por outro programa). O detalhe também vai para o console (F12) para o suporte.
 */
function erroMicrofone(e: unknown): string {
    const nome = (e as { name?: string })?.name || "";
    console.error("[microfone]", e);
    if (!navigator.mediaDevices?.getUserMedia) return "Este navegador não permite gravar áudio aqui. Use o Chrome ou o Edge atualizados.";
    if (nome === "NotAllowedError" || nome === "SecurityError" || nome === "PermissionDeniedError")
        return "O microfone está bloqueado. Libere no cadeado ao lado do endereço (ou ⋮ › Informações do app) e, no Windows, em Configurações › Privacidade e segurança › Microfone.";
    if (nome === "NotFoundError" || nome === "DevicesNotFoundError" || nome === "OverconstrainedError")
        return "Nenhum microfone encontrado neste aparelho. Conecte um fone com microfone (ou webcam) e confira em Configurações › Sistema › Som › Entrada.";
    if (nome === "NotReadableError" || nome === "TrackStartError" || nome === "AbortError")
        return "O microfone está sendo usado por outro programa (ex.: chamada no Teams, Zoom ou WhatsApp) ou não respondeu. Feche o outro programa e tente de novo.";
    return `Não foi possível começar a gravar (${nome || (e as Error)?.message || "erro desconhecido"}). Atualize a página e tente de novo.`;
}

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
        }).catch((e) => setErro(erroMicrofone(e)));
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
        }).catch((e) => setErro(erroMicrofone(e)));
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
// 24/11/2026: escolha por motivo (modelo C) — motivo, mensagem e conferir, com a prévia (SeletorModelo)
function EscolherModelo({ onEnviar, conversaId }: { onEnviar: (m: { nome: string; idioma: string; parametros: string[]; texto: string }) => void; conversaId?: number }) {
    const [escolha, setEscolha] = useState<EstadoModelo>({ modelo: null, params: [], texto: "", pronto: false });
    const sel = escolha.modelo;
    return (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            <SeletorModelo conversaId={conversaId} onEstado={setEscolha} compacto />
            {sel && (
                <button type="button" disabled={!escolha.pronto} onClick={() => onEnviar({ nome: sel.nome, idioma: sel.idioma, parametros: escolha.params.slice(0, sel.parametros).map((p) => p.trim()), texto: escolha.texto })}
                    className="h-11 flex-none rounded-xl bg-[#313C55] text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]">Enviar mensagem</button>
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
    onEnviarArquivo: (f: File | Blob, opcoes?: { mime?: string; duracao_s?: number; legenda?: string }) => void;
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
    /** 23/11/2026: cada tecla reinicia a espera do pacote de textos do WhatsApp; enviar agora ou cancelar o pacote */
    onTeclou?: () => void;
    onEnviarAgora?: () => void;
    onCancelarEnvio?: () => void;
    onAssumir: () => void;
    /** 24/11/2026: encerrar a conversa da fila sem assumir */
    onEncerrarFila?: () => void;
    /** 23/11/2026: conversa finalizada — abre um atendimento novo já com quem pediu */
    onRetomar?: () => void;
    onTransferir: () => void;
    onEncerrar: () => void;
    onSilenciar: () => void;
    onDetalhes: () => void;
}) {
    const { conversa: c, mensagens, perfil } = props;
    // 25/11/2026: visualizador de fotos da conversa (setas e miniaturas passam por todas as fotos carregadas)
    const [fotoAberta, setFotoAberta] = useState<number | null>(null);
    const fotosConversa = React.useMemo<FotoDaConversa[]>(() => mensagens.flatMap((m) => (m.apagada ? [] : m.anexos.filter((a) => a.mime.startsWith("image/")).map((a) => ({ a, m })))), [mensagens]);
    const fecharFoto = React.useCallback(() => setFotoAberta(null), []);
    useEffect(() => setFotoAberta(null), [c.id]);
    const [texto, setTexto] = useState("");
    // pacote 5B: o painel do cliente fica na página (terceira coluna ou por cima); o texto de cobrança volta por aqui
    const abrirCliente = () => props.onAbrirCliente?.();
    const [orcIa, setOrcIa] = useState(false); // orçamento preparado pela Aurora (19/10/2026)
    const [mango, setMango] = useState<ResumoMango | null>(null); // histórico da Mango (21/11/2026)
    const [verMango, setVerMango] = useState(false);
    useEffect(() => {
        setMango(null);
        setVerMango(false);
        if (props.conversa.tipo !== "externo" || props.conversa.canal !== "whatsapp") return;
        let vivo = true;
        mangoGet<ResumoMango>("resumo", { conversa_id: props.conversa.id }).then((r) => { if (vivo) setMango(r); }).catch(() => {});
        return () => { vivo = false; };
    }, [props.conversa.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const [menuTopo, setMenuTopo] = useState(false);
    const [fotosEnvio, setFotosEnvio] = useState<File[]>([]); // 24/11/2026: fotos esperando legenda antes de sair
    const escolherArquivos = (lista: File[]) => {
        const fotos = lista.filter((f) => f.type.startsWith("image/") && f.type !== "image/gif");
        lista.filter((f) => !fotos.includes(f)).forEach((f) => props.onEnviarArquivo(f));
        if (fotos.length) setFotosEnvio((atuais) => [...atuais, ...fotos].slice(0, 10));
    };
    const enviarFotos = (legenda: string) => {
        const lista = fotosEnvio;
        setFotosEnvio([]);
        lista.forEach((f, i) => props.onEnviarArquivo(f, i === 0 && legenda.trim() ? { legenda: legenda.trim() } : {}));
    };
    const menuTopoRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menuTopo) return;
        const fora = (e: Event) => {
            if (menuTopoRef.current && !menuTopoRef.current.contains(e.target as Node)) setMenuTopo(false);
        };
        document.addEventListener("pointerdown", fora);
        return () => document.removeEventListener("pointerdown", fora);
    }, [menuTopo]);
    const alternarBusca = () => {
        setBuscando((v) => !v);
        setTermo("");
        setAtual(0);
    };
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
    const parceiro = c.tipo === "parceiro"; // 24/11/2026: externo pelo WhatsApp Web (aba Externos): sem Aurora, sem fila, sem janela de 24 h
    // 16/11/2026: cliente pelo chat do site, pelo Facebook ou pelo Instagram (sem modelos aprovados; no site, sem janela de 24 h)
    const canalNovo = externo && c.canal !== "whatsapp" ? CANAIS_CLIENTE[c.canal] : undefined;
    const nomeCanal = c.canal === "site" ? "chat do site" : canalNovo ? canalNovo[0] : "WhatsApp";
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
        if (!modoNota) props.onTeclou?.();
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

    // 26/11/2026: arquivos colados (Ctrl+V) ou arrastados para a conversa, como no WhatsApp.
    // Fotos abrem a janela com legenda; outros arquivos pedem confirmação antes de sair.
    const aceitaArquivos = podeEscrever && !!perfil.midias;
    const receberArquivos = (arquivos: File[], como: "colados" | "arrastados") => {
        if (!arquivos.length || !aceitaArquivos) return;
        if (arquivos.every((f) => f.type.startsWith("image/") && f.type !== "image/gif")) {
            escolherArquivos(arquivos); // fotos: janela com legenda
            return;
        }
        const pergunta = arquivos.length > 1 ? `Enviar os ${arquivos.length} arquivos ${como}?` : arquivos[0].type.startsWith("image/") ? `Enviar a imagem?` : `Enviar "${arquivos[0].name}"?`;
        if (window.confirm(pergunta)) arquivos.forEach((f) => props.onEnviarArquivo(f));
    };
    const receberRef = useRef(receberArquivos);
    receberRef.current = receberArquivos;
    // Ctrl+V com a conversa aberta, mesmo sem clicar no campo (o campo da mensagem já trata o próprio colar)
    useEffect(() => {
        const aoColar = (e: ClipboardEvent) => {
            if (e.defaultPrevented) return;
            const alvo = e.target as HTMLElement | null;
            if (alvo && (alvo.closest("input, textarea, select, [contenteditable='true']") || alvo.closest("[role='dialog']"))) return;
            const arquivos = Array.from(e.clipboardData?.files || []);
            if (!arquivos.length) return;
            e.preventDefault();
            receberRef.current(arquivos, "colados");
        };
        document.addEventListener("paste", aoColar);
        return () => document.removeEventListener("paste", aoColar);
    }, []);
    const [arrastando, setArrastando] = useState(false);
    const arrastoProfundidade = useRef(0);
    const temArquivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const aoArrastar = {
        onDragEnter: (e: React.DragEvent) => {
            if (!temArquivos(e)) return;
            e.preventDefault();
            arrastoProfundidade.current += 1;
            setArrastando(true);
        },
        onDragOver: (e: React.DragEvent) => {
            if (!temArquivos(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = aceitaArquivos ? "copy" : "none";
        },
        onDragLeave: (e: React.DragEvent) => {
            if (!temArquivos(e)) return;
            arrastoProfundidade.current = Math.max(0, arrastoProfundidade.current - 1);
            if (arrastoProfundidade.current === 0) setArrastando(false);
        },
        onDrop: (e: React.DragEvent) => {
            if (!temArquivos(e)) return;
            e.preventDefault();
            arrastoProfundidade.current = 0;
            setArrastando(false);
            receberArquivos(Array.from(e.dataTransfer.files || []), "arrastados");
        },
    };
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
            onFixar={props.onFixarMensagem ? (x) => props.onFixarMensagem!(x, !idsFixadas.includes(x.id)) : undefined} fixada={idsFixadas.includes(m.id)}
            onEnviarAgora={m._aguardando ? props.onEnviarAgora : undefined} onCancelarEnvio={m._aguardando ? props.onCancelarEnvio : undefined} />);
        autorAnterior = autor;
    });

    const subtitulo = externo
        ? `${c.contato?.telefone || ""}${c.responsavel ? ` · Responsável: ${c.responsavel.nome}` : " · Na fila"}`
        : parceiro ? `${c.contato?.telefone || ""}${c.contato?.empresa ? ` · ${c.contato.empresa}` : ""}`
        : c.tipo === "grupo" ? `${c.membros.length} membros` : props.presenca || "";

    // 23/11/2026: janela de 24 h como selo na linha das etiquetas (fica vermelho nas 2 últimas horas e quando fecha)
    let selJanela: React.ReactNode = null;
    if (externo && c.canal !== "site" && c.status_atendimento !== "aguardando") {
        const ate = c.janela_aberta && c.janela_ate ? new Date(c.janela_ate) : null;
        const resta = ate ? ate.getTime() - Date.now() : 0;
        const alerta = !c.janela_aberta || resta < 2 * 3600000;
        const titulo = c.janela_aberta
            ? `Janela de 24 h aberta até ${ate ? ate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}`
            : canalNovo ? `Prazo para responder pelo ${canalNovo[0]} terminou: continue pelo WhatsApp (Nova conversa) se a pessoa informou o celular` : "Janela de 24 h fechada: só modelos aprovados pela Meta";
        const rotulo = c.janela_aberta
            ? resta < 3600000 ? `Janela fecha em ${Math.max(1, Math.round(resta / 60000))} min` : `Janela até ${ate ? (ate.toDateString() === new Date().toDateString() ? ate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) : "—"}`
            : canalNovo ? "Prazo encerrado" : "Janela fechada";
        selJanela = (
            <span title={titulo} role="status" className={`ml-auto inline-flex h-[22px] flex-none items-center gap-1 rounded-full px-2 text-[12px] font-extrabold ${alerta ? "bg-[#FDE8E6] text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]" : "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]"}`}>
                <Icone nome="clock" className="h-3.5 w-3.5" />{rotulo}
            </span>
        );
    }

    return (
        <FotosContexto.Provider value={setFotoAberta}>
        {fotoAberta !== null && fotosConversa.some((f) => f.a.id === fotoAberta) && <VisualizadorFoto fotos={fotosConversa} inicial={fotoAberta} titulo={c.titulo} eu={perfil.id} onFechar={fecharFoto} />}
        <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-x-hidden bg-[#EFEAE2] dark:bg-[#1C2334]" {...aoArrastar}>
            {arrastando && (
                <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-[3px] border-dashed border-[#3D6A99] bg-white/90 text-center text-[#313C55] dark:bg-[#232B3F]/95 dark:text-white">
                    <Icone nome="clip" className="h-10 w-10" />
                    <b className="text-[18px]">{aceitaArquivos ? "Solte aqui para enviar" : "Não é possível enviar arquivos nesta conversa"}</b>
                    {aceitaArquivos && <span className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Fotos abrem a janela com legenda; outros arquivos pedem confirmação.</span>}
                </div>
            )}
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
                        {externo && !canalNovo && <span title="Cliente do WhatsApp" aria-label="WhatsApp" className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]"><Icone nome="phone" className="h-3 w-3" /></span>}
                        {canalNovo && <SeloCor nome={canalNovo[0]} cor={canalNovo[1]} pequeno />}
                        {parceiro && c.wa2 && <SeloCor nome={`WhatsApp Web · ${c.wa2.numero_nome}`} cor={c.wa2.conectado ? "#2E9D5B" : "#B42318"} pequeno />}
                    </div>
                    {props.digitando ? (
                        <div className="truncate text-[14.5px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]"><span className="font-bold text-[#4E6B0A] dark:text-[#B3CE52]">{c.tipo === "grupo" ? `${props.digitando.split(" ")[0]} está digitando…` : "digitando…"}</span></div>
                    ) : (
                        <TextoRolante texto={subtitulo} className="text-[14.5px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]" />
                    )}
                </div>
                {!externo && (
                    <button type="button" onClick={alternarBusca} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Buscar nesta conversa" title="Buscar"><Icone nome="search" /></button>
                )}
                {externo && (
                    // 23/11/2026: buscar, cliente, etiquetas, histórico da Mango e contato ficam no menu ⋯ (o nome do cliente aparece inteiro)
                    <div ref={menuTopoRef} className="relative flex-none">
                        <button type="button" onClick={() => setMenuTopo((v) => !v)} aria-expanded={menuTopo} aria-haspopup="menu" className="flex h-11 w-11 items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Mais opções da conversa" title="Mais opções"><Icone nome="mais" /></button>
                        {menuTopo && (
                            <div role="menu" className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-xl border border-[#E1E5EC] bg-white py-1 shadow-xl dark:border-white/12 dark:bg-[#1C2334]">
                                {([
                                    { icone: "search", rotulo: "Buscar nesta conversa", acao: alternarBusca },
                                    { icone: "user", rotulo: props.painelClienteAberto ? "Fechar painel do cliente" : "Cliente · contrato e parcelas", acao: abrirCliente },
                                    ...(props.onEtiquetas ? [{ icone: "tag", rotulo: "Etiquetas", acao: props.onEtiquetas }] : []),
                                    ...(mango && (mango.atendimentos > 0 || mango.mensagens > 0) ? [{ icone: "clock", rotulo: "Histórico da Mango", acao: () => setVerMango(true) }] : []),
                                    ...(props.onSalvarContato ? [{ icone: c.contato?.salvo ? "editar" : "contato", rotulo: c.contato?.salvo ? "Editar nome do contato" : "Salvar contato", acao: props.onSalvarContato }] : []),
                                ] as { icone: string; rotulo: string; acao: () => void }[]).map((o) => (
                                    <button key={o.rotulo} type="button" role="menuitem" onClick={() => { setMenuTopo(false); o.acao(); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-bold text-[#1F2638] hover:bg-[#F0F2F5] dark:text-white dark:hover:bg-white/10">
                                        <Icone nome={o.icone} className="h-5 w-5 flex-none" />{o.rotulo}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {externo && c.status_atendimento === "aguardando" && (perfil.atendente || perfil.gestao) && props.onEncerrarFila && (
                    <button type="button" onClick={props.onEncerrarFila} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white" aria-label="Encerrar sem assumir" title="Encerrar sem assumir"><Icone nome="ok" className="h-[18px] w-[18px]" /><span className="hidden 2xl:inline">Encerrar</span></button>
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
                {/* 23/11/2026: fecha só a tela da conversa (não encerra o atendimento); no celular quem faz isso é a seta de voltar */}
                <button type="button" onClick={props.onVoltar} className="hidden h-11 w-11 flex-none items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] md:flex dark:text-white dark:hover:bg-white/10" aria-label="Fechar a conversa (não encerra o atendimento)" title="Fechar (não encerra)"><Icone nome="x" /></button>
            </div>
            {parceiro && (
                <div role="status" className={`flex items-center gap-2 border-b px-4 py-1.5 text-[13px] font-bold ${c.wa2 && c.wa2.conectado ? "border-[#2E9D5B]/30 bg-[#E3F4E8] text-[#1E5B32] dark:bg-[#2E9D5B]/15 dark:text-[#A8E6BD]" : "border-[#B42318]/30 bg-[#FDECEA] text-[#B42318] dark:bg-[#B42318]/20 dark:text-[#FF9C92]"}`}>
                    {!c.wa2 || c.wa2.excluido
                        ? "O número do WhatsApp Web desta conversa foi excluído: as mensagens não saem mais por ele."
                        : c.wa2.conectado
                          ? "Conversa externa pelo WhatsApp Web: sem Aurora, sem fila e sem janela de 24 h — pode escrever a qualquer hora."
                          : `O número ${c.wa2.numero_nome} está desconectado: as mensagens não saem até a Gestão ler o QR Code em Configurações do Messenger › Canais.`}
                </div>
            )}
            {externo && c.orcamento_ia && (
                <button type="button" onClick={() => setOrcIa(true)} className="flex w-full items-center gap-2 border-b border-[#3D6A99] bg-[#E9EFF6] px-4 py-2 text-left text-[14.5px] font-extrabold text-[#1E3A5C] hover:bg-[#DDE7F3] dark:bg-[#3D6A99]/25 dark:text-[#DDE7F3]">
                    <span className="flex-1">📝 A Aurora preparou um orçamento para esta família — conferir e enviar</span><span aria-hidden="true">›</span>
                </button>
            )}
            {verMango && <HistoricoMango conversaId={c.id} resumo={mango} onFechar={() => setVerMango(false)} />}
            {orcIa && <OrcamentoAurora conversaId={c.id} onFechar={() => setOrcIa(false)} onUsar={(t) => { setTexto(t); setOrcIa(false); }} />}
            {externo && (c.setor || (c.etiquetas && c.etiquetas.length > 0) || (!props.painelClienteAberto && (c.contato?.contratos || []).length > 0) || selJanela) && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#E6E9EE] bg-white px-3 py-1.5 [scrollbar-width:none] dark:border-white/12 dark:bg-[#232B3F] [&::-webkit-scrollbar]:hidden">
                    {/* com o painel do cliente aberto, plano e contrato ficam só no painel */}
                    {(props.painelClienteAberto ? [] : c.contato?.contratos || []).filter((k, i, todos) => todos.findIndex((x) => x.contrato.replace(/^0+/, "") === k.contrato.replace(/^0+/, "")) === i).slice(0, 2).map((k) => (
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
                    {selJanela}
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

            <div ref={caixa} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 md:px-4">
                {props.temMais && <button type="button" onClick={props.onCarregarMais} className="self-center rounded-full bg-white px-4 py-1.5 text-sm font-bold shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">Carregar mensagens anteriores</button>}
                {itens}
                <div ref={fim} />
            </div>

            {/* campo de envio */}
            {externo && c.status_atendimento === "encerrado" && !modoNota ? (
                // 23/11/2026: conversa finalizada — aviso e "Retomar atendimento" centralizados
                <div className="flex flex-col items-center gap-2 bg-[#F0F2F5] px-4 py-3 text-center text-sm font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                    <span className="flex items-center gap-2"><Icone nome="lock" className="h-[18px] w-[18px] flex-none" />Atendimento finalizado.</span>
                    {props.onRetomar && (
                        <button type="button" onClick={props.onRetomar} className="flex h-10 items-center gap-2 rounded-xl bg-[#313C55] px-5 text-[14px] font-extrabold text-white hover:bg-[#262F45] dark:bg-[#3D6A99] dark:hover:bg-[#4A7AAB]"><Icone nome="transf" className="h-[18px] w-[18px]" />Retomar atendimento</button>
                    )}
                </div>
            ) : externo && !c.posso_responder && !modoNota ? (
                <div className="flex items-center gap-2 bg-[#F0F2F5] px-4 py-2 text-sm font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                    <Icone nome="lock" className="h-[18px] w-[18px] flex-none" />
                    {(() => {
                        // 23/11/2026: aviso em uma linha só (o texto inteiro fica no "title")
                        const [curto, longo] = c.status_atendimento === "aguardando" ? ["Assuma o atendimento para responder.", "Assuma o atendimento para responder ao cliente."]
                            : c.gestao_acompanha ? ["Gestão: transferir ou encerrar, sem responder.", "Você vê esta conversa como Gestão: pode transferir ou encerrar, sem responder."]
                            : c.meu_papel === "observador" ? ["Você acompanha: para responder, peça a transferência.", "Você acompanha esta conversa. Para responder, ela precisa ser transferida para você."]
                            : ["Só o responsável responde ao cliente.", "Só o responsável pelo atendimento responde ao cliente."];
                        return <span className="min-w-0 flex-1 truncate" title={longo}>{curto}</span>;
                    })()}
                    {c.status_atendimento !== "aguardando" && props.onEnviarNota && (
                        <button type="button" onClick={() => setModoNota(true)} className="flex h-9 flex-none items-center gap-1.5 rounded-xl bg-[#FFF4C2] px-3 text-[13px] font-extrabold text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F7E39A]"><Icone nome="nota" className="h-4 w-4" />Nota interna</button>
                    )}
                </div>
            ) : janelaFechada && !modoNota ? (
                <div className="border-t border-[#E3E8F0] bg-white p-3 dark:border-white/12 dark:bg-[#232B3F]">
                    {canalNovo ? (
                        <div className="flex items-center gap-2 text-sm font-bold text-[#4A5468] dark:text-[#AEB9CF]"><Icone nome="lock" className="h-[18px] w-[18px] flex-none" />O prazo para responder pelo {nomeCanal} terminou. Se a pessoa informou o celular, continue pelo WhatsApp (Nova conversa).</div>
                    ) : (
                        <EscolherModelo onEnviar={props.onEnviarModelo} conversaId={c.id} />
                    )}
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
                            <Gravador mp3={externo || parceiro} onCancelar={() => setGravando(false)} onPronto={(b, mime, seg) => { setGravando(false); props.onEnviarArquivo(b, { mime, duracao_s: seg }); }} />
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
                                            receberArquivos(arquivos, "colados");
                                        }}
                                        onChange={(e) => aoDigitar(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); enviar(); } }}
                                        placeholder={modoNota ? "Nota interna" : externo ? `Responder pelo ${nomeCanal}` : parceiro ? `Responder pelo WhatsApp Web (${c.wa2?.numero_nome || ""})` : "Mensagem"}
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
                                    <input ref={arquivo} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,video/mp4" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolherArquivos([f]); }} />
                                    <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolherArquivos([f]); }} />
                                    {fotosEnvio.length > 0 && <EnvioFoto fotos={fotosEnvio} respondendo={props.respondendo} eu={perfil.id} onEnviar={enviarFotos} onCancelar={() => setFotosEnvio([])} onTirar={(i) => setFotosEnvio((l) => l.filter((_, k) => k !== i))} />}
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
        </FotosContexto.Provider>
    );
}
