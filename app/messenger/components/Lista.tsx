"use client";

import React, { useEffect, useRef, useState } from "react";
import { tonsDaCor, type Aba, type Conversa, type EtiquetaCurta, type Mensagem } from "@/components/messenger/tipos";

export const COR = { azul: "#313C55", amarelo: "#F2CB3F", verde: "#B3CE52", ciano: "#3D6A99", fundo: "#F4F6F9", borda: "#E1E5EC", texto2: "#6B7488" };

export function Icone({ nome, className = "h-5 w-5" }: { nome: string; className?: string }) {
    const p: Record<string, React.ReactNode> = {
        msg: (<><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" /></>),
        user: (<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
        users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
        phone: (<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />),
        search: (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
        plus: (<><path d="M5 12h14" /><path d="M12 5v14" /></>),
        back: (<path d="m15 18-6-6 6-6" />),
        send: (<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>),
        clip: (<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />),
        mic: (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>),
        smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>),
        file: (<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><path d="M14 2v6h6" /></>),
        checks: (<><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>),
        check: (<path d="M20 6 9 17l-5-5" />),
        clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
        transf: (<><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></>),
        ok: (<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>),
        info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
        belloff: (<><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" /><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>),
        bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
        x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
        trash: (<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
        play: (<path d="M6 4l14 8-14 8z" />),
        pause: (<><path d="M7 4h3v16H7z" /><path d="M14 4h3v16h-3z" /></>),
        lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
        wifi: (<><path d="M12 20h.01" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5 12.9a10 10 0 0 1 14 0" /><path d="m2 2 20 20" /></>),
        tpl: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10" /><path d="M7 12h10" /><path d="M7 16h6" /></>),
        responder: (<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20" /></>),
        local: (<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
        contato: (<><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" /><path d="M19 8v6" /><path d="M16 11h6" /></>),
        nota: (<><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4" /><path d="M8 12h8" /><path d="M8 16h5" /></>),
        copiar: (<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>),
        encaminhar: (<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" /></>),
        emojimais: (<><circle cx="11" cy="13" r="8" /><path d="M8 15s1 1.5 3 1.5 3-1.5 3-1.5" /><path d="M8.5 11h.01" /><path d="M13.5 11h.01" /><path d="M19 2v5" /><path d="M16.5 4.5h5" /></>),
        editar: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></>),
        tag: (<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
        expandir: (<><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></>),
        recolher: (<><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="m14 10 7-7" /><path d="m3 21 7-7" /></>),
        pin: (<><path d="M12 17v5" /><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2z" /></>),
        naolida: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></>),
        chevron: (<path d="m6 9 6 6 6-6" />),
        camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
        mais: (<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>),
        novaconversa: (<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" /><path d="M12 9v6" /><path d="M9 12h6" /></>),
    };
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {p[nome]}
        </svg>
    );
}

const TONS = ["#BDE9FA", "#DCEBAA", "#F7E39A", "#D6DCE8", "#FAD3CF"];

/** Bolinha verde de "online" no canto da foto (como no WhatsApp Web). */
function PontoOnline({ tamanho }: { tamanho: number }) {
    const d = Math.max(11, Math.round(tamanho * 0.26));
    return <span className="absolute bottom-0 right-0 rounded-full border-2 border-white bg-[#4C9A2A] dark:border-[#232B3F]" style={{ width: d, height: d }} aria-hidden="true" />;
}

export function Avatar({ conversa, tamanho = 54, online = false }: { conversa: Pick<Conversa, "id" | "tipo" | "titulo">; tamanho?: number; online?: boolean }) {
    if (conversa.tipo === "grupo") {
        return (
            <div className="flex flex-none items-center justify-center rounded-full bg-[#313C55] text-white dark:bg-[#3D6A99]" style={{ width: tamanho, height: tamanho }} aria-hidden="true">
                <Icone nome="users" className="h-5 w-5" />
            </div>
        );
    }
    const iniciais = (conversa.titulo || "?").replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
    return (
        <div className="relative flex flex-none items-center justify-center rounded-full font-extrabold text-[#313C55]" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.34), background: TONS[conversa.id % TONS.length] }} aria-hidden="true">
            {iniciais}
            {online && <PontoOnline tamanho={tamanho} />}
        </div>
    );
}

/**
 * Situação da MINHA última mensagem da conversa, para os tiques da lista:
 * equipe/grupo pela última lida de cada participante; cliente pelo status do WhatsApp.
 */
export function estadoUltima(c: Conversa, eu: number): "enviando" | "enviada" | "entregue" | "lida" | "falhou" | null {
    const m = c.ultima_mensagem;
    if (!m || m.apagada || m.autor_tipo !== "usuario" || m.autor_usuario_id !== eu) return null;
    if (m._enviando) return "enviando";
    if (c.tipo === "externo") return m.status_envio === "lida" ? "lida" : m.status_envio === "entregue" ? "entregue" : m.status_envio === "falhou" ? "falhou" : "enviada";
    const outros = c.membros.filter((p) => p.usuario_id !== eu);
    const leram = outros.filter((p) => p.ultima_lida_id >= m.id).length;
    return outros.length > 0 && leram === outros.length ? "lida" : leram > 0 ? "entregue" : "enviada";
}

export function TiquesLista({ estado }: { estado: ReturnType<typeof estadoUltima> }) {
    if (!estado) return null;
    if (estado === "falhou") return <span className="flex-none text-[12.5px] font-extrabold text-[#B42318] dark:text-[#FF9C92]">Falhou</span>;
    if (estado === "enviando") return <span className="flex-none" aria-label="Enviando"><Icone nome="clock" className="h-[15px] w-[15px] text-[#6B7488] dark:text-[#AEB9CF]" /></span>;
    if (estado === "enviada") return <span className="flex-none" aria-label="Enviada"><Icone nome="check" className="h-4 w-4 text-[#6B7488] dark:text-[#AEB9CF]" /></span>;
    return <span className={`flex-none ${estado === "lida" ? "text-[#3D6A99] dark:text-[#A9BED6]" : "text-[#6B7488] dark:text-[#AEB9CF]"}`} aria-label={estado === "lida" ? "Lida" : "Entregue"}><Icone nome="checks" className="h-4 w-4" /></span>;
}

export function hora(iso: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const ontem = new Date(hoje.getTime() - 86400000);
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function previa(m: Mensagem | null): string {
    if (!m) return "";
    if (m.apagada) return "Mensagem apagada";
    if (m.interna) return "📝 Nota: " + (m.texto || "");
    const quem = m.autor_tipo === "sistema" ? "" : "";
    switch (m.tipo) {
        case "imagem": return quem + "Foto" + (m.texto ? `: ${m.texto}` : "");
        case "audio": return quem + "Áudio";
        case "documento": return quem + (m.anexos[0]?.nome_original || "Documento");
        default: return quem + (m.texto || "");
    }
}

function Badge({ n }: { n: number }) {
    if (!n) return null;
    return <span className="inline-flex h-6 min-w-6 flex-none items-center justify-center rounded-full bg-[#B3CE52] px-1.5 text-[13px] font-extrabold text-[#1F2638]">{n > 99 ? "99+" : n}</span>;
}

/** Filtros em pílula, como no WhatsApp: Tudo · Equipe · Grupos · Clientes (com contador). */
export function Abas({ aba, setAba, contagem }: { aba: Aba; setAba: (a: Aba) => void; contagem: Record<Aba, number> }) {
    const itens: { id: Aba; rotulo: string }[] = [
        { id: "tudo", rotulo: "Tudo" },
        { id: "clientes", rotulo: "Clientes" },
        { id: "grupos", rotulo: "Grupos" },
        { id: "equipe", rotulo: "Equipe" },
    ];
    return (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar conversas">
            {itens.map((i) => (
                <button
                    key={i.id}
                    type="button"
                    aria-pressed={aba === i.id}
                    onClick={() => setAba(i.id)}
                    className={`flex h-[38px] flex-none items-center gap-1.5 rounded-full px-4 text-[15.5px] md:h-9 md:px-3 md:text-[14px] ${aba === i.id ? "bg-[#E3EFC0] font-extrabold text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-white" : "bg-[#F0F2F5] font-bold text-[#4A5468] hover:bg-[#E6E9EE] dark:bg-[#1C2334] dark:text-[#AEB9CF] dark:hover:bg-white/10"}`}
                >
                    {i.rotulo}
                    {i.id !== "tudo" && contagem[i.id] > 0 && <span className="text-[14px] font-extrabold">{contagem[i.id]}</span>}
                </button>
            ))}
        </div>
    );
}

/** Selo com a cor do setor ou da etiqueta (fundo claro, texto escuro; no modo escuro, fundo translúcido). */
export function SeloCor({ nome, cor, ponto = false, pequeno = false }: { nome: string; cor: string; ponto?: boolean; pequeno?: boolean }) {
    const t = tonsDaCor(cor);
    return (
        <span className={`inline-flex flex-none items-center gap-1 rounded-full font-extrabold ${pequeno ? "h-[22px] px-2 text-[12px]" : "h-7 px-2.5 text-[13px]"}`} style={{ background: t.fundo, color: t.texto }}>
            {ponto && <span className="h-2 w-2 flex-none rounded-full" style={{ background: cor }} aria-hidden="true" />}
            {nome}
        </span>
    );
}

export function SelosEtiquetas({ etiquetas, max = 2 }: { etiquetas?: EtiquetaCurta[]; max?: number }) {
    if (!etiquetas?.length) return null;
    return (
        <>
            {etiquetas.slice(0, max).map((e) => <SeloCor key={e.id} nome={e.nome} cor={e.cor} pequeno />)}
            {etiquetas.length > max && <span className="flex-none text-[12px] font-extrabold text-[#5B6478] dark:text-[#AEB9CF]">+{etiquetas.length - max}</span>}
        </>
    );
}

/** Ações de deslizar (celular) e do menu (computador): fixar no topo e marcar como não lida/lida. */
export type AcoesLinha = { onFixar: () => void; onMarcar: () => void };

const LARGURA_ACOES = 172;

export function LinhaConversa({ c, selecionada, onAbrir, eu, acao, online = false, acoes }: { c: Conversa; selecionada: boolean; onAbrir: () => void; eu: number; acao?: React.ReactNode; online?: boolean; acoes?: AcoesLinha }) {
    const m = c.ultima_mensagem;
    const minha = m?.autor_usuario_id === eu && m?.autor_tipo === "usuario";
    const naoLidaMarcada = !!c.marcada_nao_lida && !c.nao_lidas;
    const [dx, setDx] = useState(0);
    const [arrastando, setArrastando] = useState(false);
    const [menu, setMenu] = useState(false);
    const toque = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
    const caixa = useRef<HTMLDivElement>(null);

    // fecha as ações ao tocar fora da linha
    useEffect(() => {
        if (dx === 0 && !menu) return;
        const fora = (e: Event) => {
            if (caixa.current && !caixa.current.contains(e.target as Node)) {
                setDx(0);
                setMenu(false);
            }
        };
        document.addEventListener("pointerdown", fora);
        return () => document.removeEventListener("pointerdown", fora);
    }, [dx, menu]);

    let etiqueta: React.ReactNode = null;
    if (c.tipo === "externo") {
        if (c.status_atendimento === "aguardando" && (c.prioridade || 0) > 0) etiqueta = <span className="flex-none rounded-full bg-[#B42318] px-2 py-px text-[12.5px] font-extrabold text-white" title="Falecimento comunicado: prioridade">⚠️ Falecimento</span>;
        else if (c.status_atendimento === "aguardando" && !acao) etiqueta = <span className="flex-none rounded-full bg-[#FCEFB4] px-2 py-px text-[12.5px] font-extrabold text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F7E39A]">Na fila</span>;
        else if (c.gestao_acompanha) etiqueta = <span className="flex-none rounded-full bg-[#EEF2F7] px-2 py-px text-[12.5px] font-extrabold text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]">Gestão · {c.responsavel?.nome?.split(" ")[0] || "—"}</span>;
        else if (c.meu_papel === "observador") etiqueta = <span className="flex-none rounded-full bg-[#EEF2F7] px-2 py-px text-[12.5px] font-extrabold text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]">Com {c.responsavel?.nome?.split(" ")[0] || "outro"}</span>;
    }
    const executar = (f: () => void) => {
        setDx(0);
        setMenu(false);
        f();
    };
    const destaque = c.nao_lidas > 0 || naoLidaMarcada;
    return (
        <div ref={caixa} className="group relative min-h-[76px] w-full flex-none overflow-x-clip" style={{ overflowY: "visible" }}>
            {acoes && (
                <div className="absolute inset-y-0 right-0 flex md:hidden" style={{ width: LARGURA_ACOES }} aria-hidden={dx === 0}>
                    <button type="button" tabIndex={dx === 0 ? -1 : 0} onClick={() => executar(acoes.onMarcar)} className="flex flex-1 flex-col items-center justify-center gap-1 bg-[#3D6A99] text-[13px] font-bold text-white">
                        <Icone nome={naoLidaMarcada || c.nao_lidas ? "checks" : "naolida"} className="h-6 w-6" />
                        {naoLidaMarcada || c.nao_lidas ? "Lida" : "Não lida"}
                    </button>
                    <button type="button" tabIndex={dx === 0 ? -1 : 0} onClick={() => executar(acoes.onFixar)} className="flex flex-1 flex-col items-center justify-center gap-1 bg-[#6B7488] text-[13px] font-bold text-white">
                        <Icone nome="pin" className="h-6 w-6" />
                        {c.fixada ? "Desafixar" : "Fixar"}
                    </button>
                </div>
            )}
            <div
                className={`relative flex w-full items-center gap-3 bg-white px-3 dark:bg-[#232B3F] ${arrastando ? "" : "transition-transform duration-200"}`}
                style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
                onTouchStart={(e) => {
                    if (!acoes) return;
                    const t = e.touches[0];
                    toque.current = { x: t.clientX, y: t.clientY, dx, horizontal: null };
                }}
                onTouchMove={(e) => {
                    const ini = toque.current;
                    if (!ini) return;
                    const t = e.touches[0];
                    const ddx = t.clientX - ini.x;
                    const ddy = t.clientY - ini.y;
                    if (ini.horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) ini.horizontal = Math.abs(ddx) > Math.abs(ddy);
                    if (ini.horizontal) {
                        setArrastando(true);
                        setDx(Math.max(-LARGURA_ACOES, Math.min(0, ini.dx + ddx)));
                    }
                }}
                onTouchEnd={() => {
                    const ini = toque.current;
                    toque.current = null;
                    setArrastando(false);
                    if (ini?.horizontal) setDx((v) => (v < -LARGURA_ACOES / 2.5 ? -LARGURA_ACOES : 0));
                }}
            >
                <div className={`pointer-events-none absolute inset-0 ${selecionada ? "bg-[#F0F2F5] dark:bg-[#3D6A99]/20" : "group-hover:bg-[#F5F6F8] dark:group-hover:bg-white/10"}`} />
                <button type="button" onClick={() => (dx !== 0 ? setDx(0) : onAbrir())} className="relative flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
                    <Avatar conversa={c} online={online} />
                    <div className="min-w-0 flex-1 border-b border-[#EEF0F3] pb-3 dark:border-white/10">
                        <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1 truncate text-[18px] font-extrabold text-[#1F2638] md:text-[16px] dark:text-white">{c.titulo}{(c.contato?.contratos || []).length > 0 && <span className="ml-1.5 align-middle text-[13px]" title={`Contrato ${c.contato!.contratos!.map((k) => k.contrato).join(", ")}`} aria-label="Vinculado a contrato">📄</span>}</div>
                            <div className={`flex-none text-[13.5px] font-bold ${destaque ? "text-[#4E6B0A] dark:text-[#B3CE52]" : "text-[#6B7488] dark:text-[#AEB9CF]"}`}>{hora(c.ultima_mensagem_em)}</div>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
                            {etiqueta}
                            {c.setor && c.status_atendimento === "aguardando" && <SeloCor nome={c.setor.nome} cor={c.setor.cor} ponto pequeno />}
                            <SelosEtiquetas etiquetas={c.etiquetas} />
                            <TiquesLista estado={estadoUltima(c, eu)} />
                            <div className="min-w-0 flex-1 truncate text-[16px] text-[#5B6478] md:text-[14.5px] dark:text-[#AEB9CF]">
                                {m && c.tipo === "grupo" && !minha && m.autor_nome && m.autor_tipo !== "sistema" ? `${m.autor_nome.split(" ")[0]}: ` : ""}
                                {previa(m)}
                            </div>
                            {c.silenciada && <Icone nome="belloff" className="h-[18px] w-[18px] flex-none text-[#6B7488] dark:text-[#AEB9CF]" />}
                            {c.fixada && <span aria-label="Fixada"><Icone nome="pin" className="h-[18px] w-[18px] flex-none text-[#6B7488] dark:text-[#AEB9CF]" /></span>}
                            {naoLidaMarcada ? <span className="h-[14px] w-[14px] flex-none rounded-full bg-[#B3CE52]" aria-label="Marcada como não lida" /> : <Badge n={c.nao_lidas} />}
                        </div>
                    </div>
                </button>
                {acoes && (
                    <div className="relative hidden flex-none md:block">
                        <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Opções da conversa" aria-expanded={menu} className={`flex h-9 w-9 items-center justify-center rounded-full text-[#5B6478] hover:bg-black/5 dark:text-[#AEB9CF] dark:hover:bg-white/10 ${menu ? "flex" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
                            <Icone nome="chevron" className="h-5 w-5" />
                        </button>
                        {menu && (
                            <div role="menu" className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-[#E1E5EC] bg-white py-1 shadow-xl dark:border-white/12 dark:bg-[#1C2334]">
                                <button type="button" role="menuitem" onClick={() => executar(acoes.onFixar)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-bold text-[#1F2638] hover:bg-[#F0F2F5] dark:text-white dark:hover:bg-white/10">
                                    <Icone nome="pin" className="h-5 w-5" />{c.fixada ? "Desafixar conversa" : "Fixar conversa"}
                                </button>
                                <button type="button" role="menuitem" onClick={() => executar(acoes.onMarcar)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-bold text-[#1F2638] hover:bg-[#F0F2F5] dark:text-white dark:hover:bg-white/10">
                                    <Icone nome={naoLidaMarcada || c.nao_lidas ? "checks" : "naolida"} className="h-5 w-5" />{naoLidaMarcada || c.nao_lidas ? "Marcar como lida" : "Marcar como não lida"}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {acao && <div className="relative">{acao}</div>}
            </div>
        </div>
    );
}
