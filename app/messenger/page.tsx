"use client";

/**
 * Messenger — conversas da equipe, grupos e atendimento de clientes pelo WhatsApp.
 * Rota /messenger · página "messenger" do pai_api.php · API: messenger.php
 * Visual do mockup "PAI Messenger estilo WhatsApp" (07/10/2026).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { enviarArquivo, msgGet, msgPost, novoUuid } from "@/components/messenger/api";
import { comprimirFoto } from "@/components/messenger/compressao";
import { ativarNotificacoes, ouvir, ouvirNotificacoes, ouvirSeguranca, type EstadoNotificacoes } from "@/components/messenger/tempoReal";
import { ocultarBarraCelular } from "@/components/barra/BarraCelular";
import type { Aba, Conversa, Mensagem, Perfil } from "@/components/messenger/tipos";
import { Abas, Icone, LinhaConversa } from "./components/Lista";
import JanelaConversa from "./components/Conversa";
import { DetalhesGrupo, NovaConversa, Transferir } from "./components/Modais";
import HistoricoClientes from "./components/Historico";

/**
 * Celular com a conversa aberta: a conversa ocupa só a parte visível da tela (acima do teclado),
 * como no WhatsApp. No iPhone o teclado não diminui a página; por isso a altura vem do visualViewport.
 */
function useAreaVisivel(ativo: boolean) {
    const [area, setArea] = useState<{ altura: number; topo: number } | null>(null);
    useEffect(() => {
        if (!ativo || typeof window === "undefined" || !window.visualViewport) {
            setArea(null);
            return;
        }
        const vv = window.visualViewport;
        const celular = window.matchMedia("(max-width: 767px)");
        const medir = () => setArea(celular.matches ? { altura: Math.round(vv.height), topo: Math.round(vv.offsetTop) } : null);
        medir();
        vv.addEventListener("resize", medir);
        vv.addEventListener("scroll", medir);
        celular.addEventListener?.("change", medir);
        const antes = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        return () => {
            vv.removeEventListener("resize", medir);
            vv.removeEventListener("scroll", medir);
            celular.removeEventListener?.("change", medir);
            document.documentElement.style.overflow = antes;
        };
    }, [ativo]);
    return area;
}

const TIPOS_DOC: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", mp4: "video/mp4",
};

export default function MessengerPage() {
    const [perfil, setPerfil] = useState<Perfil | null>(null);
    const [aba, setAba] = useState<Aba>("tudo");
    const [conversas, setConversas] = useState<Conversa[]>([]);
    const [fila, setFila] = useState<Conversa[]>([]);
    const [selId, setSelId] = useState<number | null>(null);
    const [conversaSel, setConversaSel] = useState<Conversa | null>(null);
    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [temMais, setTemMais] = useState(false);
    const [busca, setBusca] = useState("");
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [carregando, setCarregando] = useState(true);
    const [seguranca, setSeguranca] = useState(false);
    const [digitando, setDigitando] = useState<Record<number, { nome: string; ate: number }>>({});
    const [modal, setModal] = useState<null | "nova" | "grupo" | "transferir" | "detalhes">(null);
    const [verHistorico, setVerHistorico] = useState(false);
    const [notif, setNotif] = useState<{ estado: EstadoNotificacoes; detalhe?: string }>({ estado: "desligadas" });
    const selRef = useRef<number | null>(null);
    selRef.current = selId;

    /* ---------- carregamento ---------- */
    const carregarListas = useCallback(async () => {
        try {
            const [lista, pf] = await Promise.all([msgGet<Conversa[]>("conversas"), perfil ? Promise.resolve(perfil) : msgGet<Perfil>("perfil")]);
            setConversas(lista);
            if (!perfil) setPerfil(pf);
            if (pf.atendente) setFila(await msgGet<Conversa[]>("fila").catch(() => []));
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setCarregando(false);
        }
    }, [perfil]);

    const abrirConversa = useCallback(async (id: number, manterMensagens = false) => {
        setSelId(id);
        if (!manterMensagens) {
            setMensagens([]);
            setTemMais(false);
        }
        const u = new URL(window.location.href);
        u.searchParams.set("conversa", String(id));
        window.history.replaceState(null, "", u.toString());
        try {
            const d = await msgGet<{ conversa: Conversa; mensagens: Mensagem[]; tem_mais: boolean }>("mensagens", { conversa_id: id });
            if (selRef.current !== id) return;
            setConversaSel(d.conversa);
            setMensagens(d.mensagens);
            setTemMais(d.tem_mais);
            const ultimo = d.mensagens[d.mensagens.length - 1];
            if (ultimo && d.conversa.participo) {
                await msgPost("marcar_lida", { conversa_id: id, ate_id: ultimo.id }).catch(() => {});
                window.dispatchEvent(new Event("messenger:lida"));
                setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, nao_lidas: 0 } : c)));
            }
        } catch (e: any) {
            if (e.status === 403 || e.status === 404) {
                setSelId(null);
                setConversaSel(null);
                setAviso(e.message);
            } else setErro(e.message);
        }
    }, []);

    const fecharConversa = () => {
        setSelId(null);
        setConversaSel(null);
        const u = new URL(window.location.href);
        u.searchParams.delete("conversa");
        window.history.replaceState(null, "", u.toString());
    };

    useEffect(() => {
        carregarListas();
        const id = Number(new URLSearchParams(window.location.search).get("conversa") || 0);
        if (id) abrirConversa(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------- barra de baixo do celular: some com a conversa aberta ---------- */
    useEffect(() => {
        ocultarBarraCelular(selId !== null);
    }, [selId]);
    useEffect(() => () => {
        ocultarBarraCelular(false);
    }, []);

    /* ---------- notificações (OneSignal, o mesmo do app) ----------
       Com o app aberto na própria conversa, não mostra a notificação dela. */
    useEffect(() => {
        const w = window as any;
        let oneSignal: any = null;
        const aoExibir = (ev: any) => {
            const dados = ev?.notification?.additionalData || {};
            if (dados.origem === "messenger" && Number(dados.conversa_id) === selRef.current && document.visibilityState === "visible") {
                ev.preventDefault();
            }
        };
        w.OneSignalDeferred = w.OneSignalDeferred || [];
        w.OneSignalDeferred.push((OS: any) => {
            oneSignal = OS;
            OS?.Notifications?.addEventListener?.("foregroundWillDisplay", aoExibir);
        });
        return () => oneSignal?.Notifications?.removeEventListener?.("foregroundWillDisplay", aoExibir);
    }, []);

    /* ---------- notificações pela Ably (quando o servidor usa esse canal) ---------- */
    useEffect(() => ouvirNotificacoes((estado, detalhe) => setNotif({ estado, detalhe })), []);

    /* ---------- tempo real ---------- */
    const recarregarDepois = useRef<ReturnType<typeof setTimeout> | null>(null);
    const agendarRecarga = useCallback(() => {
        if (recarregarDepois.current) clearTimeout(recarregarDepois.current);
        recarregarDepois.current = setTimeout(() => carregarListas(), 500);
    }, [carregarListas]);

    useEffect(() => {
        const pararSeg = ouvirSeguranca(setSeguranca);
        const parar = ouvir(({ nome, dados }) => {
            const aberta = selRef.current;
            if (nome === "mensagem") {
                const m = dados as Mensagem;
                if (m.conversa_id === aberta) {
                    setMensagens((ms) => {
                        const i = ms.findIndex((x) => x.id === m.id || (m.cliente_uuid && x.cliente_uuid === m.cliente_uuid));
                        if (i >= 0) return ms.map((x, j) => (j === i ? m : x));
                        return [...ms, m].sort((a, b) => a.id - b.id);
                    });
                    setDigitando((d) => ({ ...d, [m.conversa_id]: { nome: "", ate: 0 } }));
                    if (document.visibilityState === "visible") {
                        msgPost("marcar_lida", { conversa_id: m.conversa_id, ate_id: m.id }).then(() => window.dispatchEvent(new Event("messenger:lida"))).catch(() => {});
                    }
                }
                agendarRecarga();
            } else if (nome === "mensagem_apagada") {
                if (dados.conversa_id === aberta) setMensagens((ms) => ms.map((x) => (x.id === dados.mensagem_id ? { ...x, apagada: true, texto: null, anexos: [] } : x)));
                agendarRecarga();
            } else if (nome === "status_envio") {
                if (dados.conversa_id === aberta) setMensagens((ms) => ms.map((x) => (x.id === dados.mensagem_id ? { ...x, status_envio: dados.status_envio, erro_envio: dados.erro_envio } : x)));
            } else if (nome === "leitura") {
                if (dados.conversa_id === aberta) {
                    setConversaSel((c) => (c ? { ...c, membros: c.membros.map((p) => (p.usuario_id === dados.usuario_id ? { ...p, ultima_lida_id: Math.max(p.ultima_lida_id, dados.ultima_lida_id) } : p)) } : c));
                }
            } else if (nome === "digitando") {
                setDigitando((d) => ({ ...d, [dados.conversa_id]: { nome: dados.nome, ate: Date.now() + 4000 } }));
                setTimeout(() => setDigitando((d) => ({ ...d })), 4200);
            } else if (nome === "conversa") {
                agendarRecarga();
                if (dados.conversa_id === aberta) abrirConversa(dados.conversa_id, true);
            }
        });
        return () => {
            parar();
            pararSeg();
        };
    }, [agendarRecarga, abrirConversa]);

    /* ---------- listas por aba ---------- */
    const porAba = useMemo(() => {
        const q = busca.trim().toLowerCase();
        const f = (c: Conversa) => !q || c.titulo.toLowerCase().includes(q) || (c.contato?.telefone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "#");
        return {
            tudo: conversas.filter(f),
            equipe: conversas.filter((c) => c.canal === "interno" && f(c)),
            grupos: conversas.filter((c) => c.tipo === "grupo" && f(c)),
            clientes: conversas.filter((c) => c.canal === "whatsapp" && f(c)),
            fila: fila.filter(f),
        };
    }, [conversas, fila, busca]);
    const contagem: Record<Aba, number> = {
        tudo: conversas.filter((c) => c.nao_lidas > 0).length + fila.length,
        equipe: conversas.filter((c) => c.canal === "interno" && c.nao_lidas > 0).length,
        grupos: conversas.filter((c) => c.tipo === "grupo" && c.nao_lidas > 0).length,
        clientes: fila.length + conversas.filter((c) => c.canal === "whatsapp" && c.nao_lidas > 0).length,
    };

    /* ---------- envio ---------- */
    const acrescentarLocal = (m: Mensagem) => setMensagens((ms) => [...ms, m]);
    const trocarLocal = (uuid: string, nova: Partial<Mensagem>) => setMensagens((ms) => ms.map((x) => (x.cliente_uuid === uuid ? { ...x, ...nova } : x)));
    const mensagemLocal = (uuid: string, tipo: Mensagem["tipo"], texto: string | null): Mensagem => ({
        id: Number.MAX_SAFE_INTEGER, conversa_id: selId!, autor_tipo: "usuario", autor_usuario_id: perfil!.id, autor_contato_id: null, autor_nome: perfil!.nome,
        tipo, texto, responde_a_id: null, cliente_uuid: uuid, status_envio: null, erro_envio: null, apagada: false, criado_em: new Date().toISOString(), anexos: [], _enviando: true,
    });
    const enviarCorpo = async (uuid: string, corpo: Record<string, any>) => {
        try {
            const r = await msgPost("enviar", { conversa_id: selId, cliente_uuid: uuid, ...corpo });
            setMensagens((ms) => ms.map((x) => (x.cliente_uuid === uuid ? r.dados : x)).sort((a, b) => a.id - b.id));
            agendarRecarga();
        } catch (e: any) {
            trocarLocal(uuid, { _enviando: false, _falhaLocal: e.message });
            if (e.detalhe?.janela_fechada) abrirConversa(selId!, true);
        }
    };
    const enviarTexto = (t: string) => {
        const uuid = novoUuid();
        acrescentarLocal(mensagemLocal(uuid, "texto", t));
        enviarCorpo(uuid, { tipo: "texto", texto: t });
    };
    const enviarModelo = (m: { nome: string; idioma: string; parametros: string[]; texto: string }) => {
        const uuid = novoUuid();
        acrescentarLocal(mensagemLocal(uuid, "modelo", m.texto));
        enviarCorpo(uuid, { tipo: "modelo", texto: m.texto, modelo: { nome: m.nome, idioma: m.idioma, parametros: m.parametros } });
    };
    const enviarMidia = async (f: File | Blob, opcoes: { mime?: string; duracao_s?: number } = {}) => {
        const uuid = novoUuid();
        const nome = (f as File).name || "";
        let mime = (opcoes.mime || f.type || "").split(";")[0];
        if (!mime && nome) mime = TIPOS_DOC[nome.split(".").pop()!.toLowerCase()] || "";
        const tipo: Mensagem["tipo"] = mime.startsWith("image/") ? "imagem" : mime.startsWith("audio/") ? "audio" : "documento";
        acrescentarLocal({ ...mensagemLocal(uuid, tipo, tipo === "documento" ? nome : null), texto: tipo === "imagem" ? "Enviando foto…" : tipo === "audio" ? "Enviando áudio…" : `Enviando ${nome}…` });
        try {
            const anexo: Record<string, any> = { nome_original: nome || null, duracao_s: opcoes.duracao_s };
            if (tipo === "imagem" && mime !== "image/gif") {
                const foto = await comprimirFoto(f);
                anexo.chave = await enviarArquivo(foto.arquivo, "image/jpeg");
                anexo.miniatura_chave = await enviarArquivo(foto.miniatura, "image/jpeg", "miniatura").catch(() => null);
                anexo.largura = foto.largura;
                anexo.altura = foto.altura;
            } else {
                anexo.chave = await enviarArquivo(f, mime);
            }
            await enviarCorpo(uuid, { tipo, anexo });
        } catch (e: any) {
            trocarLocal(uuid, { _enviando: false, _falhaLocal: e.message });
        }
    };

    /* ---------- ações ---------- */
    const executar = async (fn: () => Promise<any>, ok?: string) => {
        try {
            const r = await fn();
            setAviso(ok || r?.msg || "");
            setErro("");
            return r;
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const assumir = (id: number) => executar(async () => {
        const r = await msgPost("assumir", { conversa_id: id });
        await carregarListas();
        await abrirConversa(id);
        return r;
    }, "Atendimento assumido.");
    const encerrar = () => {
        if (!conversaSel || !window.confirm("Encerrar o atendimento? A conversa vai para o histórico e sai da sua lista.")) return;
        executar(async () => {
            const r = await msgPost("encerrar", { conversa_id: conversaSel.id });
            fecharConversa();
            await carregarListas();
            return r;
        });
    };
    const apagar = (m: Mensagem) => {
        if (!window.confirm("Apagar esta mensagem para todos?")) return;
        executar(async () => {
            const r = await msgPost("apagar_mensagem", { mensagem_id: m.id });
            setMensagens((ms) => ms.map((x) => (x.id === m.id ? { ...x, apagada: true, texto: null, anexos: [] } : x)));
            return r;
        });
    };
    const silenciar = () => conversaSel && executar(async () => {
        const r = await msgPost("silenciar", { conversa_id: conversaSel.id, silenciada: !conversaSel.silenciada });
        setConversaSel({ ...conversaSel, silenciada: r.dados.silenciada });
        return r;
    }, conversaSel.silenciada ? "Notificações desta conversa ligadas." : "Conversa silenciada.");
    const carregarMais = async () => {
        if (!selId || !mensagens.length) return;
        try {
            const d = await msgGet<{ mensagens: Mensagem[]; tem_mais: boolean }>("mensagens", { conversa_id: selId, antes_id: mensagens[0].id });
            setMensagens((ms) => [...d.mensagens, ...ms]);
            setTemMais(d.tem_mais);
        } catch (e: any) {
            setErro(e.message);
        }
    };

    const digitandoAgora = selId && digitando[selId] && digitando[selId].ate > Date.now() ? digitando[selId].nome : "";
    const listaAtual = aba === "clientes" ? porAba.clientes : aba === "grupos" ? porAba.grupos : aba === "equipe" ? porAba.equipe : porAba.tudo;
    const area = useAreaVisivel(selId !== null);

    if (carregando && !perfil) return <div className="p-8 text-[#313C55] dark:text-white">Carregando o Messenger…</div>;
    if (verHistorico) return <HistoricoClientes embutido onVoltar={() => setVerHistorico(false)} />;

    return (
        <div className={`flex ${selId ? "h-[calc(100dvh-var(--header-height))]" : "h-[calc(100dvh-var(--header-height)-4.25rem-env(safe-area-inset-bottom))]"} flex-col overflow-x-hidden bg-white text-[#1F2638] md:h-[calc(100dvh-var(--header-height))] md:min-h-[560px] md:bg-[#F4F6F9] md:p-4 dark:bg-[#1C2334] dark:text-white md:dark:bg-[#1C2334]`}>
            {(erro || aviso) && (
                <div className={`mx-2 mb-2 mt-2 flex items-center gap-3 rounded-xl border px-4 py-2 text-sm font-bold md:mx-0 md:mt-0 ${erro ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]" : "border-[#B3CE52] bg-[#EEF5D6] dark:bg-[#B3CE52]/15"}`}>
                    <span className="flex-1">{erro || aviso}</span>
                    <button type="button" onClick={() => { setErro(""); setAviso(""); }} aria-label="Fechar aviso"><Icone nome="x" className="h-4 w-4" /></button>
                </div>
            )}
            <div className="relative grid min-h-0 flex-1 overflow-hidden border-[#E1E5EC] bg-white md:grid-cols-[400px_minmax(0,1fr)] md:rounded-2xl md:border dark:border-white/12 dark:bg-[#232B3F]">
                {/* lista */}
                <div className={`${selId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-[#E6E9EE] dark:border-white/12`}>
                    <div className="flex items-center gap-1 pb-1 pl-4 pr-2 pt-3">
                        <h1 className="m-0 flex-1 text-[26px] font-extrabold text-[#313C55] md:text-2xl dark:text-white">Conversas</h1>
                        <button type="button" onClick={() => setModal("nova")} className="hidden h-11 w-11 items-center justify-center rounded-full text-[#313C55] hover:bg-[#F0F2F5] md:flex dark:text-white dark:hover:bg-white/10" aria-label="Nova conversa" title="Nova conversa"><Icone nome="novaconversa" className="h-[22px] w-[22px]" /></button>
                        <button type="button" onClick={() => setVerHistorico(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-[#313C55] hover:bg-[#F0F2F5] dark:text-white dark:hover:bg-white/10" aria-label="Histórico de clientes" title="Histórico de clientes"><Icone nome="clock" className="h-[22px] w-[22px]" /></button>
                    </div>
                    <div className="flex flex-col gap-2.5 px-4 pb-2.5 pt-1">
                        <label className="flex h-[42px] items-center gap-2.5 rounded-full bg-[#F0F2F5] px-3.5 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                            <Icone nome="search" />
                            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar" aria-label="Pesquisar conversa" className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1F2638] outline-none dark:text-white" />
                        </label>
                        <Abas aba={aba} setAba={setAba} contagem={contagem} />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-24 md:pb-3">
                        {seguranca && <div className="mx-2 mb-1 rounded-lg bg-[#FCF3CC] px-3 py-1.5 text-xs font-bold dark:bg-[#F2CB3F]/15">Modo de segurança: atualizando a cada 5 s.</div>}
                        {perfil?.notificacoes_canal === "ably" && notif.estado === "pendente" && (
                            <div className="mx-2 mb-1 flex items-center gap-2 rounded-lg bg-[#E9EFF6] px-3 py-1.5 text-xs font-bold dark:bg-[#3D6A99]/20">
                                <span className="flex-1">Receba aviso de mensagem nova neste aparelho.</span>
                                <button type="button" onClick={() => ativarNotificacoes()} className="h-8 rounded-[10px] bg-[#313C55] px-3 text-[12.5px] font-extrabold text-white dark:bg-[#3D6A99]">Ativar notificações</button>
                            </div>
                        )}
                        {perfil?.notificacoes_canal === "ably" && (notif.estado === "negadas" || notif.estado === "erro") && (
                            <div className="mx-2 mb-1 rounded-lg bg-[#FCF3CC] px-3 py-1.5 text-xs font-bold dark:bg-[#F2CB3F]/15">
                                {notif.estado === "negadas" ? "As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador para receber avisos." : `Não foi possível ativar as notificações: ${notif.detalhe || "erro desconhecido"}`}
                            </div>
                        )}
                        {aba === "grupos" && (
                            <div className="flex items-center gap-2 px-3 pb-1.5 pt-2 text-[11.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">
                                <span className="flex-1">Grupos{contagem.grupos ? ` · ${contagem.grupos} com mensagens novas` : ""}</span>
                                <button type="button" onClick={() => setModal("grupo")} className="h-8 rounded-[10px] bg-[#313C55] px-3 text-[13px] normal-case tracking-normal text-white dark:bg-[#3D6A99]">+ Criar grupo</button>
                            </div>
                        )}
                        {(aba === "clientes" || (aba === "tudo" && porAba.fila.length > 0)) && perfil?.atendente && (
                            <>
                                <div className="px-3 pb-1.5 pt-2 text-[11.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Aguardando atendimento · {porAba.fila.length}</div>
                                {porAba.fila.map((c) => (
                                    <LinhaConversa key={`f${c.id}`} c={c} eu={perfil.id} selecionada={selId === c.id} onAbrir={() => abrirConversa(c.id)}
                                        acao={<button type="button" onClick={() => assumir(c.id)} className="h-9 flex-none rounded-[10px] bg-[#313C55] px-3 text-[13px] font-extrabold text-white dark:bg-[#3D6A99]">Assumir</button>} />
                                ))}
                                {!porAba.fila.length && <p className="px-4 text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum cliente na fila.</p>}
                                <div className="px-3 pb-1.5 pt-3 text-[11.5px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{aba === "tudo" ? "Conversas" : "Em atendimento"}</div>
                            </>
                        )}
                        {perfil && listaAtual.map((c) => (
                            <LinhaConversa key={c.id} c={c} eu={perfil.id} selecionada={selId === c.id} onAbrir={() => abrirConversa(c.id)} />
                        ))}
                        {!listaAtual.length && !carregando && (
                            <p className="px-4 py-4 text-sm text-[#6B7488] dark:text-[#AEB9CF]">
                                {aba === "clientes" ? (perfil?.atendente ? "Nenhum atendimento com você." : "Você não atende clientes do WhatsApp.") : aba === "grupos" ? "Você ainda não participa de grupos." : "Nenhuma conversa ainda. Toque no botão de nova conversa para começar."}
                            </p>
                        )}
                    </div>
                </div>
                {!selId && (
                    <button type="button" onClick={() => setModal("nova")} className="absolute bottom-4 right-4 flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-[#313C55] text-white shadow-[0_4px_12px_rgba(31,38,56,0.25)] md:hidden dark:bg-[#3D6A99]" aria-label="Nova conversa">
                        <Icone nome="novaconversa" className="h-[26px] w-[26px]" />
                    </button>
                )}
                {/* conversa (no celular, ocupa a área visível acima do teclado) */}
                <div className={`${selId ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-[#EFEAE2] dark:bg-[#1C2334]`} style={area ? { position: "fixed", left: 0, right: 0, top: area.topo, height: area.altura, zIndex: 60 } : undefined}>
                    {conversaSel && perfil && selId === conversaSel.id ? (
                        <JanelaConversa
                            conversa={conversaSel} mensagens={mensagens} perfil={perfil} temMais={temMais} digitando={digitandoAgora} seguranca={seguranca}
                            onVoltar={fecharConversa} onCarregarMais={carregarMais}
                            onEnviarTexto={enviarTexto} onEnviarModelo={enviarModelo} onEnviarArquivo={enviarMidia} onApagar={apagar}
                            onDigitando={() => msgPost("digitando", { conversa_id: conversaSel.id }).catch(() => {})}
                            onAssumir={() => assumir(conversaSel.id)} onTransferir={() => setModal("transferir")} onEncerrar={encerrar}
                            onSilenciar={silenciar} onDetalhes={() => setModal("detalhes")}
                        />
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#F0F2F5] p-8 text-center text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                            <Icone nome="msg" className="h-10 w-10" />
                            <p className="text-[15px] font-bold">{selId ? "Abrindo a conversa…" : "Escolha uma conversa"}</p>
                        </div>
                    )}
                </div>
            </div>

            {(modal === "nova" || modal === "grupo") && (
                <NovaConversa grupoInicial={modal === "grupo"} onFechar={() => setModal(null)} onAberta={(c) => { setModal(null); carregarListas(); setAba(c.tipo === "grupo" ? "grupos" : "equipe"); abrirConversa(c.id); }} />
            )}
            {modal === "transferir" && conversaSel && (
                <Transferir conversa={conversaSel} onFechar={() => setModal(null)} onFeito={() => { setModal(null); setAviso("Conversa transferida. Você continua acompanhando, sem responder."); carregarListas(); abrirConversa(conversaSel.id, true); }} />
            )}
            {modal === "detalhes" && conversaSel && perfil && (
                <DetalhesGrupo conversa={conversaSel} perfil={perfil} onFechar={() => setModal(null)} onMudou={(c) => { setConversaSel(c); carregarListas(); }} onSaiu={() => { setModal(null); fecharConversa(); carregarListas(); }} />
            )}
        </div>
    );
}
