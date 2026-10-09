"use client";

import React, { useEffect, useRef, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import { formatoAudio } from "@/components/messenger/compressao";
import type { Conversa as TConversa, Mensagem, Perfil, Anexo as TAnexo } from "@/components/messenger/tipos";
import { Avatar, Icone } from "./Lista";

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
            <button type="button" onClick={abrirOriginal} className="mb-1 block overflow-hidden rounded-lg bg-[#F0F2F5] dark:bg-[#1C2334]" style={{ width: 280, maxWidth: "100%", aspectRatio: a.largura && a.altura ? `${a.largura}/${a.altura}` : "4/3" }} aria-label="Abrir foto">
                {url ? <img src={url} alt="Foto enviada" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-bold text-[#6B7488] dark:text-[#AEB9CF]">{erro ? "Foto indisponível" : "Carregando foto…"}</span>}
            </button>
        );
    }
    if (audio) {
        return url ? <audio controls preload="metadata" src={url} className="my-1 w-[260px] max-w-full" /> : <span className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">{erro ? "Áudio indisponível" : "Carregando áudio…"}</span>;
    }
    const kb = Math.max(1, Math.round(a.tamanho_bytes / 1024));
    return (
        <button type="button" onClick={abrirOriginal} className={`mb-1 flex min-w-[220px] items-center gap-3 rounded-lg p-2 text-left ${minha ? "bg-[#D4E5A2] dark:bg-white/10" : "bg-[#F0F2F5] dark:bg-[#1C2334]"}`}>
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[#3D6A99] text-white"><Icone nome="file" /></span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{a.nome_original || "Documento"}</span>
                <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">{kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}</span>
            </span>
        </button>
    );
}

/* ---------------- bolha (estilo WhatsApp) ---------------- */
const TIQUE_AZUL = "#3D6A99";
function Tiques({ estado }: { estado: "enviando" | "enviada" | "entregue" | "lida" }) {
    if (estado === "enviando") return <span aria-label="Enviando"><Icone nome="clock" className="h-[14px] w-[14px] text-[#6B7488] dark:text-[#C9D1DE]" /></span>;
    if (estado === "enviada") return <span aria-label="Enviada"><Icone nome="check" className="h-4 w-4 text-[#6B7488] dark:text-[#C9D1DE]" /></span>;
    return <span className={estado === "lida" ? "text-[#3D6A99] dark:text-[#A9BED6]" : "text-[#6B7488] dark:text-[#C9D1DE]"} aria-label={estado === "lida" ? "Lida" : "Entregue"}><Icone nome="checks" className="h-4 w-4" /></span>;
}

function Bolha({ m, conversa, eu, onApagar, primeiraDoBloco }: { m: Mensagem; conversa: TConversa; eu: number; onApagar: (m: Mensagem) => void; primeiraDoBloco: boolean }) {
    if (m.autor_tipo === "sistema") {
        return <div className="my-1 self-center rounded-lg bg-white/90 px-3 py-1 text-center text-[14px] font-bold text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F] dark:text-[#AEB9CF]">{m.texto}</div>;
    }
    const minha = m.autor_tipo === "usuario" && m.autor_usuario_id === eu;
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
    const cantos = primeiraDoBloco ? (minha ? "rounded-[10px] rounded-tr-none" : "rounded-[10px] rounded-tl-none") : "rounded-[10px]";
    return (
        <div className={`group max-w-[85%] md:max-w-[65%] ${minha ? "self-end" : "self-start"} ${primeiraDoBloco ? "mt-1.5" : ""}`}>
            <div className={`px-3 pb-1.5 pt-1.5 text-[17px] leading-snug text-[#1F2638] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] ${cantos} ${minha ? "bg-[#E3EFC0] dark:bg-[#3D6A99] dark:text-white" : "bg-white dark:bg-[#232B3F] dark:text-white"}`}>
                {!minha && conversa.tipo !== "individual" && primeiraDoBloco && <div className="mb-0.5 text-[14.5px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{m.autor_nome || "—"}</div>}
                {m.apagada ? (
                    <span className="italic text-[#6B7488] dark:text-[#C9D1DE]">Mensagem apagada</span>
                ) : (
                    <>
                        {m.anexos.map((a) => <Anexo key={a.id} a={a} minha={minha} />)}
                        {m.texto && m.tipo !== "audio" && <span className="whitespace-pre-wrap break-words">{m.texto}</span>}
                    </>
                )}
                <span className="float-right ml-2.5 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[12.5px] font-semibold text-[#5B6478] dark:text-[#C9D1DE]">
                    {podeApagar && (
                        <button type="button" onClick={() => onApagar(m)} className="hidden items-center rounded px-1 hover:bg-black/5 group-hover:flex" aria-label="Apagar mensagem">
                            <Icone nome="trash" className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {hora} {leitura}
                </span>
            </div>
            {m._falhaLocal && <div className="mt-1 text-right text-xs font-bold text-[#B42318] dark:text-[#FF9C92]">{m._falhaLocal}</div>}
        </div>
    );
}

/* ---------------- gravador de áudio ---------------- */
function Gravador({ onPronto, onCancelar }: { onPronto: (b: Blob, mime: string, seg: number) => void; onCancelar: () => void }) {
    const [seg, setSeg] = useState(0);
    const [erro, setErro] = useState("");
    const rec = useRef<MediaRecorder | null>(null);
    const partes = useRef<Blob[]>([]);
    const inicio = useRef(Date.now());
    const cancelado = useRef(false);
    useEffect(() => {
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
    const parar = () => rec.current?.state === "recording" && rec.current.stop();
    const cancelar = () => {
        cancelado.current = true;
        if (rec.current?.state === "recording") rec.current.stop();
        onCancelar();
    };
    return (
        <div className="flex min-h-[54px] flex-1 items-center gap-3 rounded-full bg-white px-4 py-1.5 shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">
            {erro ? <span className="flex-1 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</span> : (
                <>
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#B42318]" aria-hidden="true" />
                    <span className="flex-1 text-sm font-extrabold text-[#313C55] dark:text-white">Gravando {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, "0")}</span>
                </>
            )}
            <button type="button" onClick={cancelar} className="rounded-lg px-3 py-1.5 text-sm font-bold text-[#5B6478] hover:bg-white dark:text-[#AEB9CF] dark:hover:bg-[#232B3F]">Cancelar</button>
            {!erro && <button type="button" onClick={parar} className="rounded-lg bg-[#313C55] px-3 py-1.5 text-sm font-extrabold text-white dark:bg-[#3D6A99]">Enviar</button>}
        </div>
    );
}

/* ---------------- modelos (janela de 24 h fechada) ---------------- */
function EscolherModelo({ onEnviar }: { onEnviar: (m: { nome: string; idioma: string; parametros: string[]; texto: string }) => void }) {
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
                    {params.map((p, i) => (
                        <input key={i} className="h-10 rounded-xl border border-[#E1E5EC] px-3 text-sm dark:border-white/12" placeholder={`Valor de {{${i + 1}}}`} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
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
    onApagar: (m: Mensagem) => void;
    onDigitando: () => void;
    onAssumir: () => void;
    onTransferir: () => void;
    onEncerrar: () => void;
    onSilenciar: () => void;
    onDetalhes: () => void;
}) {
    const { conversa: c, mensagens, perfil } = props;
    const [texto, setTexto] = useState("");
    const [emoji, setEmoji] = useState(false);
    const [catEmoji, setCatEmoji] = useState("Rostos");
    const [gravando, setGravando] = useState(false);
    const fim = useRef<HTMLDivElement>(null);
    const caixa = useRef<HTMLDivElement>(null);
    const arquivo = useRef<HTMLInputElement>(null);
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
    }, [c.id]);

    const externo = c.tipo === "externo";
    const janelaFechada = externo && !c.janela_aberta;
    const enviar = () => {
        const t = texto.trim();
        if (!t) return;
        props.onEnviarTexto(t);
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
    mensagens.forEach((m) => {
        const d = new Date(m.criado_em).toLocaleDateString("pt-BR");
        if (d !== dia) {
            dia = d;
            autorAnterior = "";
            itens.push(<div key={`d${m.id}`} className="my-2 self-center rounded-lg bg-white px-3 py-1 text-[13.5px] font-extrabold uppercase text-[#4A5468] shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F] dark:text-[#AEB9CF]">{d === hoje ? "Hoje" : d === ontem ? "Ontem" : d}</div>);
        }
        const autor = m.autor_tipo === "sistema" ? "" : `${m.autor_tipo}:${m.autor_usuario_id ?? m.autor_contato_id ?? ""}`;
        itens.push(<Bolha key={m.cliente_uuid || m.id} m={m} conversa={c} eu={perfil.id} onApagar={props.onApagar} primeiraDoBloco={autor !== autorAnterior} />);
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
                        <span className="truncate text-[19px] font-extrabold text-[#1F2638] dark:text-white">{c.titulo}</span>
                        {externo && <span className="hidden flex-none items-center gap-1 rounded-full bg-[#EEF5D6] px-2 py-0.5 text-[11.5px] font-extrabold sm:inline-flex dark:bg-[#B3CE52]/15"><Icone nome="phone" className="h-3 w-3" />WhatsApp</span>}
                    </div>
                    <div className="truncate text-[14.5px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">{props.digitando ? <span className="font-bold text-[#4E6B0A] dark:text-[#B3CE52]">{c.tipo === "grupo" ? `${props.digitando.split(" ")[0]} está digitando…` : "digitando…"}</span> : subtitulo}</div>
                </div>
                {externo && c.status_atendimento === "aguardando" && perfil.atendente && (
                    <button type="button" onClick={props.onAssumir} className="h-10 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white dark:bg-[#3D6A99]">Assumir</button>
                )}
                {externo && c.status_atendimento === "em_atendimento" && (c.posso_responder || perfil.gestao) && (
                    <>
                        <button type="button" onClick={props.onTransferir} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white" aria-label="Transferir conversa"><Icone nome="transf" className="h-[18px] w-[18px]" /><span className="hidden sm:inline">Transferir</span></button>
                        <button type="button" onClick={props.onEncerrar} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white" aria-label="Encerrar atendimento"><Icone nome="ok" className="h-[18px] w-[18px]" /><span className="hidden sm:inline">Encerrar</span></button>
                    </>
                )}
                {!externo && (
                    <>
                        <button type="button" onClick={props.onSilenciar} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label={c.silenciada ? "Voltar a notificar" : "Silenciar conversa"} title={c.silenciada ? "Silenciada" : "Silenciar"}><Icone nome={c.silenciada ? "belloff" : "bell"} /></button>
                        {c.tipo === "grupo" && <button type="button" onClick={props.onDetalhes} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10" aria-label="Detalhes do grupo"><Icone nome="info" /></button>}
                    </>
                )}
            </div>
            {externo && c.status_atendimento !== "aguardando" && (
                <div className={`flex items-center gap-2 border-b border-[#E3E8F0] px-4 py-2 text-[13.5px] font-bold dark:border-white/12 ${c.janela_aberta ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/15" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15"}`} role="status">
                    <Icone nome="clock" className="h-[18px] w-[18px]" />
                    {c.janela_aberta ? `Janela de 24 h aberta até ${new Date(c.janela_ate || "").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Janela de 24 h fechada: só modelos aprovados pela Meta"}
                </div>
            )}

            <div ref={caixa} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 md:px-[8%]">
                {props.temMais && <button type="button" onClick={props.onCarregarMais} className="self-center rounded-full bg-white px-4 py-1.5 text-sm font-bold shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">Carregar mensagens anteriores</button>}
                {itens}
                <div ref={fim} />
            </div>

            {/* campo de envio */}
            {externo && !c.posso_responder ? (
                <div className="flex items-center gap-2 bg-[#F0F2F5] px-4 py-3 text-sm font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                    <Icone nome="lock" className="h-[18px] w-[18px] flex-none" />
                    {c.status_atendimento === "aguardando" ? "Assuma o atendimento para responder ao cliente." : c.gestao_acompanha ? "Você vê esta conversa como Gestão: pode transferir ou encerrar, sem responder." : c.meu_papel === "observador" ? "Você acompanha esta conversa. Para responder, ela precisa ser transferida para você." : "Só o responsável pelo atendimento responde ao cliente."}
                </div>
            ) : janelaFechada ? (
                <div className="border-t border-[#E3E8F0] bg-white p-3 dark:border-white/12 dark:bg-[#232B3F]"><EscolherModelo onEnviar={props.onEnviarModelo} /></div>
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
                    <div className="flex items-end gap-1.5 px-2 pb-2 pt-1.5 md:px-4">
                        {gravando ? (
                            <Gravador onCancelar={() => setGravando(false)} onPronto={(b, mime, seg) => { setGravando(false); props.onEnviarArquivo(b, { mime, duracao_s: seg }); }} />
                        ) : (
                            <>
                                <div className="flex min-h-[54px] min-w-0 flex-1 items-end rounded-[27px] bg-white px-1.5 shadow-[0_1px_0.5px_rgba(31,38,56,0.13)] dark:bg-[#232B3F]">
                                    <button type="button" onClick={() => setEmoji((v) => !v)} aria-pressed={emoji} className={`flex h-[54px] w-11 flex-none items-center justify-center ${emoji ? "text-[#313C55] dark:text-white" : "text-[#5B6478] dark:text-[#AEB9CF]"}`} aria-label="Emojis"><Icone nome="smile" className="h-[26px] w-[26px]" /></button>
                                    {/* 16 px: com menos, o iPhone dá zoom ao tocar no campo e a tela sai do lugar */}
                                    <textarea
                                        rows={1}
                                        value={texto}
                                        onChange={(e) => aoDigitar(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); enviar(); } }}
                                        placeholder={externo ? "Responder pelo WhatsApp" : "Mensagem"}
                                        aria-label="Mensagem"
                                        className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-[13px] text-[18px] leading-7 text-[#1F2638] outline-none dark:text-white"
                                    />
                                    <button type="button" onClick={() => arquivo.current?.click()} disabled={!perfil.midias} className="flex h-[54px] w-11 flex-none items-center justify-center text-[#5B6478] disabled:opacity-40 dark:text-[#AEB9CF]" aria-label="Anexar foto ou documento" title={perfil.midias ? "Anexar" : "Mídias não configuradas"}><Icone nome="clip" className="h-[25px] w-[25px]" /></button>
                                    {!texto.trim() && (
                                        <button type="button" onClick={() => camera.current?.click()} disabled={!perfil.midias} className="flex h-[54px] w-11 flex-none items-center justify-center text-[#5B6478] disabled:opacity-40 dark:text-[#AEB9CF]" aria-label="Tirar foto"><Icone nome="camera" className="h-[25px] w-[25px]" /></button>
                                    )}
                                    <input ref={arquivo} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,video/mp4" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) props.onEnviarArquivo(f); }} />
                                    <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) props.onEnviarArquivo(f); }} />
                                </div>
                                {texto.trim() ? (
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
