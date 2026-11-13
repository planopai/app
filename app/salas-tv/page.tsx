"use client";

/**
 * Salas do Memorial (/salas-tv) — 13/11/2026.
 *
 * Liga, desliga e atualiza as TVs de cada sala pelo celular, de qualquer lugar.
 * Cada sala tem um par: o PAINEL de fora (QR Code) e a TV de dentro (mensagens).
 *
 * O app não fala com as TVs: grava o pedido em salas_tv.php; o agente do PC do Memorial busca,
 * executa na rede local e devolve o andamento/resultado. Esta tela só acompanha:
 * - estado a cada 10 s (3 s enquanto houver pedido andando; pausa com a aba escondida);
 * - "Memorial online/offline" pelo último sinal do agente (botões desativados offline).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconAlertTriangle,
    IconCheck,
    IconDeviceTv,
    IconLoader2,
    IconPower,
    IconRefresh,
    IconVolume,
    IconWifi,
    IconWifiOff,
    IconX,
} from "@tabler/icons-react";

/* ============================== API ============================== */

const API = "https://api.planoassistencialintegrado.com.br/salas_tv.php";
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}

/* ============================== tipos ============================== */

type EstadoTV = "ligada" | "tela_apagada" | "desligada" | "sem_controle" | "nao_autorizada" | "desconhecida";
type Acao = "ligar" | "desligar" | "atualizar" | "volume";
type Situacao = "pendente" | "executando" | "concluido" | "falhou" | "expirado";

type TV = {
    tv: string;
    estado: EstadoTV;
    volume: number | null;
    volume_max: number | null;
    atualizado_em: string | null;
};

type Pedido = {
    id: number;
    sala?: string;
    acao: Acao;
    valor: number | null;
    situacao: Situacao;
    resultado: string | null;
    usuario_nome: string | null;
    criado_em: string;
    concluido_em: string | null;
};

type Sala = { sala: string; painel: TV; dentro: TV; ultimo_pedido: Pedido | null };

type Estado = {
    agente: { online: boolean; visto_em: string | null; segundos: number | null };
    salas: Sala[];
    historico: Pedido[];
    agora: string;
};

/* ============================== utilidades ============================== */

const andando = (p: Pedido | null | undefined) => !!p && (p.situacao === "pendente" || p.situacao === "executando");

/** "2026-11-13 14:05:10" → "14:05" (hoje) ou "12/11 14:05". */
function hora(dt: string | null | undefined, agora?: string) {
    if (!dt) return "";
    const [d, h] = dt.split(" ");
    const hhmm = (h || "").slice(0, 5);
    if (agora && agora.slice(0, 10) === d) return hhmm;
    const [, m, dia] = d.split("-");
    return `${dia}/${m} ${hhmm}`;
}

/** Segundos entre dois "Y-m-d H:i:s" do servidor (mesmo fuso). */
function segundosEntre(a: string | null | undefined, b: string | null | undefined) {
    if (!a || !b) return Infinity;
    const pa = Date.parse(a.replace(" ", "T"));
    const pb = Date.parse(b.replace(" ", "T"));
    return Number.isFinite(pa) && Number.isFinite(pb) ? Math.abs(pb - pa) / 1000 : Infinity;
}

const ROTULO_ACAO: Record<Acao, string> = { ligar: "Ligar", desligar: "Desligar", atualizar: "Atualizar telas", volume: "Volume" };

const TEXTO_ESTADO: Record<EstadoTV, { txt: string; ponto: string; cor: string }> = {
    ligada: { txt: "Ligada", ponto: "bg-[#3FBF7F] shadow-[0_0_8px_#3FBF7F]", cor: "text-[#2E8B5B] dark:text-[#5FE09A]" },
    tela_apagada: { txt: "Tela apagada", ponto: "bg-[#F2CB3F]", cor: "text-[#8A6D00] dark:text-[#F2CB3F]" },
    desligada: { txt: "Desligada", ponto: "bg-[#A3ACBD] dark:bg-[#5A6580]", cor: "text-[#5B6478] dark:text-[#AEB9CF]" },
    sem_controle: { txt: "Na rede, sem controle", ponto: "bg-[#F2CB3F]", cor: "text-[#8A6D00] dark:text-[#F2CB3F]" },
    nao_autorizada: { txt: "Falta autorizar o PC", ponto: "bg-[#E5484D]", cor: "text-[#B42318] dark:text-[#FF9C92]" },
    desconhecida: { txt: "Sem informação", ponto: "bg-[#A3ACBD] dark:bg-[#5A6580]", cor: "text-[#5B6478] dark:text-[#AEB9CF]" },
};

const BTN_BASE =
    "inline-flex min-h-[48px] whitespace-nowrap items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIM = `${BTN_BASE} bg-[#313C55] text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]`;
const BTN_SEC = `${BTN_BASE} border border-[#C9D1DE] bg-[#FFFFFF] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/8`;
const BTN_PERIGO = `${BTN_BASE} border border-[#F1B5AE] bg-[#FFFFFF] text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92]/40 dark:bg-transparent dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10`;

/* ============================== confirmação (desligar) ============================== */

function Confirmar({ sala, onSim, onNao }: { sala: string; onSim: () => void; onNao: () => void }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => {
        setMontado(true);
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onNao();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onNao]);
    if (!montado) return null;
    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(49,60,85,0.45)] lg:items-center" onClick={onNao}>
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-t-3xl bg-[#FFFFFF] p-6 shadow-xl dark:bg-[#232B3F] lg:rounded-3xl"
                style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-[20px] font-extrabold text-[#313C55] dark:text-white">Desligar a {sala}?</h2>
                <p className="mt-2 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">
                    O painel de fora e a TV de dentro serão desligados. Para ligar de novo, use &quot;Ligar sala&quot;.
                </p>
                <div className="mt-6 flex gap-3 lg:justify-end">
                    <button type="button" className={`${BTN_SEC} flex-1 lg:flex-none`} onClick={onNao}>
                        Voltar
                    </button>
                    <button type="button" className={`${BTN_PERIGO} flex-1 lg:flex-none`} onClick={onSim}>
                        <IconPower size={18} stroke={2} /> Desligar
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/* ============================== cartão da sala ============================== */

function CaixaTV({ titulo, tv }: { titulo: string; tv: TV }) {
    const e = TEXTO_ESTADO[tv.estado] ?? TEXTO_ESTADO.desconhecida;
    return (
        <div className="rounded-2xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#7A8396] dark:text-[#AEB9CF]">
                <IconDeviceTv size={14} stroke={2} /> {titulo}
            </div>
            <div className={`mt-2 flex items-center gap-2 text-[15px] font-extrabold ${e.cor}`}>
                <span className={`size-2.5 shrink-0 rounded-full ${e.ponto}`} />
                {e.txt}
            </div>
        </div>
    );
}

function CartaoSala({
    s,
    online,
    agora,
    enviando,
    onAcao,
}: {
    s: Sala;
    online: boolean;
    agora: string;
    enviando: boolean;
    onAcao: (sala: string, acao: Acao, valor?: number) => void;
}) {
    const [confirmar, setConfirmar] = useState(false);
    const p = s.ultimo_pedido;
    const ocupado = enviando || andando(p);
    const ligadas = [s.painel, s.dentro].filter((t) => t.estado === "ligada").length;
    const todasDesligadas = [s.painel, s.dentro].every((t) => t.estado === "desligada" || t.estado === "desconhecida");
    const bloqueado = !online || ocupado;

    const volMax = s.dentro.volume_max || 15;
    const [vol, setVol] = useState<number | null>(s.dentro.volume);
    const arrastando = useRef(false);
    useEffect(() => {
        if (!arrastando.current) setVol(s.dentro.volume);
    }, [s.dentro.volume]);

    // Resultado recente (até 3 min) do último pedido que não seja volume.
    const recente = p && !andando(p) && p.acao !== "volume" && segundosEntre(p.concluido_em || p.criado_em, agora) < 180 ? p : null;

    let selo = { txt: "Sala desligada", cls: "bg-[#EEF2F7] text-[#5B6478] dark:bg-white/8 dark:text-[#AEB9CF]" };
    if (ocupado) selo = { txt: "Aguarde…", cls: "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]" };
    else if (ligadas === 2) selo = { txt: "● Sala ligada", cls: "bg-[#EEF5D6] text-[#2E7A12] dark:bg-[#3FBF7F]/15 dark:text-[#5FE09A]" };
    else if (!todasDesligadas) selo = { txt: "⚠ Atenção", cls: "bg-[#FCF3CC] text-[#8A6D00] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]" };

    const borda =
        ligadas === 2 && !ocupado
            ? "border-[#7BA11A]/60 dark:border-[#3FBF7F]/40"
            : ocupado
              ? "border-[#F2CB3F] dark:border-[#F2CB3F]/60"
              : "border-[#E3E8F0] dark:border-white/12";

    const enviarVolume = () => {
        arrastando.current = false;
        if (vol != null && vol !== s.dentro.volume) onAcao(s.sala, "volume", vol);
    };

    return (
        <section className={`flex flex-col gap-4 rounded-3xl border-2 bg-[#FFFFFF] p-5 dark:bg-[#232B3F] ${borda}`}>
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-[26px] font-black tracking-wide text-[#313C55] dark:text-white">{s.sala}</h2>
                <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${selo.cls}`}>{selo.txt}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <CaixaTV titulo="Painel (fora)" tv={s.painel} />
                <CaixaTV titulo="TV (dentro)" tv={s.dentro} />
            </div>

            {/* Andamento / resultado */}
            {(enviando || andando(p)) && (
                <div className="flex items-start gap-2 rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    <IconLoader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
                    <span>
                        {enviando || !p
                            ? "Enviando para o Memorial…"
                            : p.situacao === "pendente"
                              ? `${ROTULO_ACAO[p.acao]}: aguardando o Memorial receber…`
                              : `${ROTULO_ACAO[p.acao]}: ${p.resultado || "executando…"}`}
                    </span>
                </div>
            )}
            {recente && (
                <div
                    className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${
                        recente.situacao === "concluido"
                            ? "bg-[#EEF5D6] text-[#2E5A0E] dark:bg-[#B3CE52]/18 dark:text-[#CFE68A]"
                            : "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/12 dark:text-[#FF9C92]"
                    }`}
                >
                    {recente.situacao === "concluido" ? (
                        <IconCheck size={18} className="mt-0.5 shrink-0" />
                    ) : (
                        <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                    )}
                    <span>
                        {recente.resultado || (recente.situacao === "concluido" ? "Feito." : "Não deu certo.")}
                        <span className="ml-1 font-normal opacity-75">
                            · {hora(recente.concluido_em || recente.criado_em, agora)}
                            {recente.usuario_nome ? ` · ${recente.usuario_nome}` : ""}
                        </span>
                    </span>
                </div>
            )}
            {!ocupado && !recente && [s.painel, s.dentro].some((t) => t.estado === "sem_controle") && (
                <div className="rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#8A6D00] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    {s.painel.estado === "sem_controle" ? "Painel" : "TV de dentro"} na rede, mas sem a depuração (ADB): ative de novo em
                    Opções do desenvolvedor da TV. Acontece na TCL depois de queda de energia.
                </div>
            )}
            {!ocupado && !recente && ligadas === 1 && ![s.painel, s.dentro].some((t) => t.estado === "sem_controle") && (
                <div className="rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#8A6D00] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    Só uma das TVs está ligada. Toque em Ligar sala para ligar as duas.
                </div>
            )}

            {/* Som da TV de dentro */}
            <div className={`flex items-center gap-3 ${s.dentro.estado !== "ligada" || vol == null ? "opacity-45" : ""}`}>
                <IconVolume size={20} className="shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                <span className="shrink-0 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Som de dentro</span>
                <input
                    type="range"
                    aria-label={`Volume da TV de dentro da ${s.sala}`}
                    min={0}
                    max={volMax}
                    value={vol ?? 0}
                    disabled={bloqueado || s.dentro.estado !== "ligada" || vol == null}
                    onChange={(e) => {
                        arrastando.current = true;
                        setVol(Number(e.target.value));
                    }}
                    onPointerUp={enviarVolume}
                    onKeyUp={enviarVolume}
                    onBlur={() => arrastando.current && enviarVolume()}
                    className="h-11 min-w-0 flex-1 accent-[#313C55] dark:accent-[#F2CB3F]"
                />
                <b className="w-11 shrink-0 text-right text-[14px] text-[#313C55] dark:text-white">
                    {vol == null || s.dentro.estado !== "ligada" ? "—" : `${Math.round((vol / volMax) * 100)}%`}
                </b>
            </div>

            {/* Botões conforme o estado */}
            <div className="mt-auto grid grid-cols-2 gap-3">
                {ligadas === 2 ? (
                    <>
                        <button type="button" className={BTN_SEC} disabled={bloqueado} onClick={() => onAcao(s.sala, "atualizar")}>
                            <IconRefresh size={18} stroke={2} /> Atualizar
                        </button>
                        <button type="button" className={BTN_PERIGO} disabled={bloqueado} onClick={() => setConfirmar(true)}>
                            <IconPower size={18} stroke={2} /> Desligar
                        </button>
                    </>
                ) : todasDesligadas ? (
                    <button
                        type="button"
                        className={`${BTN_PRIM} col-span-2 min-h-[56px] text-[17px]`}
                        disabled={bloqueado}
                        onClick={() => onAcao(s.sala, "ligar")}
                    >
                        <IconPower size={20} stroke={2.2} /> LIGAR {s.sala}
                    </button>
                ) : (
                    <>
                        <button type="button" className={BTN_PRIM} disabled={bloqueado} onClick={() => onAcao(s.sala, "ligar")}>
                            <IconPower size={18} stroke={2} /> Ligar sala
                        </button>
                        <button type="button" className={BTN_PERIGO} disabled={bloqueado} onClick={() => setConfirmar(true)}>
                            Desligar
                        </button>
                    </>
                )}
            </div>

            {confirmar && (
                <Confirmar
                    sala={s.sala}
                    onNao={() => setConfirmar(false)}
                    onSim={() => {
                        setConfirmar(false);
                        onAcao(s.sala, "desligar");
                    }}
                />
            )}
        </section>
    );
}

/* ============================== página ============================== */

export default function SalasTvPage() {
    const [estado, setEstado] = useState<Estado | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [enviando, setEnviando] = useState<Record<string, boolean>>({});
    const [rapido, setRapido] = useState(false); // consulta a cada 1 s logo depois de um clique
    const rapidoTimer = useRef<number | null>(null);
    useEffect(() => () => {
        if (rapidoTimer.current) window.clearTimeout(rapidoTimer.current);
    }, []);
    const carregandoRef = useRef(false);

    const carregar = useCallback(async () => {
        if (carregandoRef.current) return;
        carregandoRef.current = true;
        try {
            const j = await apiJson(`${API}?action=estado&_=${Date.now()}`);
            setEstado(j as Estado);
            setErro("");
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
        } finally {
            carregandoRef.current = false;
        }
    }, []);

    // Atualiza sozinho: 1 s logo depois de um clique e enquanto há pedido andando, 10 s parado; pausa com a aba escondida.
    const temAndamento = !!estado?.salas.some((s) => andando(s.ultimo_pedido)) || Object.values(enviando).some(Boolean);
    useEffect(() => {
        carregar();
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible") carregar();
        }, rapido || temAndamento ? 1000 : 10000);
        const voltou = () => document.visibilityState === "visible" && carregar();
        document.addEventListener("visibilitychange", voltou);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", voltou);
        };
    }, [carregar, temAndamento, rapido]);

    const pedir = useCallback(
        async (sala: string, acao: Acao, valor?: number) => {
            setAviso("");
            setEnviando((m) => ({ ...m, [sala]: true }));
            setRapido(true);
            if (rapidoTimer.current) window.clearTimeout(rapidoTimer.current);
            rapidoTimer.current = window.setTimeout(() => setRapido(false), 20000);
            try {
                await apiJson(`${API}?action=pedir`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sala, acao, valor }),
                });
            } catch (e) {
                setAviso(e instanceof Error ? e.message : "Não foi possível enviar o pedido.");
            } finally {
                await carregar();
                setEnviando((m) => ({ ...m, [sala]: false }));
            }
        },
        [carregar],
    );

    const agente = estado?.agente;
    const online = !!agente?.online;

    return (
        <main className="min-h-full bg-[#F6F8FB] px-4 pb-28 pt-5 dark:bg-[#161C2A] lg:px-8 lg:pb-10 lg:pt-8">
            <div className="mx-auto max-w-[1280px]">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-[24px] font-extrabold text-[#313C55] dark:text-white lg:text-[28px]">Salas do Memorial</h1>
                        <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Ligue e desligue as TVs de cada sala: painel de fora + TV de dentro.
                        </p>
                    </div>
                    {estado && (
                        <div
                            className={`inline-flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-[13px] font-extrabold sm:self-auto ${
                                online
                                    ? "bg-[#EEF5D6] text-[#2E7A12] dark:bg-[#3FBF7F]/15 dark:text-[#5FE09A]"
                                    : "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/12 dark:text-[#FF9C92]"
                            }`}
                        >
                            {online ? <IconWifi size={16} stroke={2.2} /> : <IconWifiOff size={16} stroke={2.2} />}
                            {online
                                ? "Memorial online"
                                : agente?.visto_em
                                  ? `Memorial offline desde ${hora(agente.visto_em, estado.agora)}`
                                  : "Memorial ainda não se conectou"}
                        </div>
                    )}
                </header>

                {!online && estado && (
                    <div className="mt-4 rounded-2xl border border-[#F1B5AE] bg-[#FDECEA] px-4 py-3 text-[14px] text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        O PC do Memorial não está respondendo (desligado ou sem internet). Os botões voltam assim que ele se conectar.
                        O estado das TVs abaixo é o último que ele informou.
                    </div>
                )}
                {(erro || aviso) && (
                    <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-[#F1B5AE] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span>{aviso || erro}</span>
                        {aviso && (
                            <button type="button" aria-label="Fechar aviso" className="-m-2 grid size-11 shrink-0 place-items-center" onClick={() => setAviso("")}>
                                <IconX size={18} />
                            </button>
                        )}
                    </div>
                )}

                {!estado && !erro && (
                    <div className="mt-10 flex items-center justify-center gap-2 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">
                        <IconLoader2 size={20} className="animate-spin" /> Carregando as salas…
                    </div>
                )}

                {estado && (
                    <>
                        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:mt-6 lg:gap-5 xl:grid-cols-3">
                            {estado.salas.map((s) => (
                                <CartaoSala
                                    key={s.sala}
                                    s={s}
                                    online={online}
                                    agora={estado.agora}
                                    enviando={!!enviando[s.sala]}
                                    onAcao={pedir}
                                />
                            ))}
                        </div>

                        {estado.historico.length > 0 && (
                            <section className="mt-6 rounded-3xl border border-[#E3E8F0] bg-[#FFFFFF] p-5 dark:border-white/12 dark:bg-[#232B3F]">
                                <h2 className="text-[12px] font-extrabold uppercase tracking-[.12em] text-[#5B6478] dark:text-[#AEB9CF]">
                                    Últimos pedidos
                                </h2>
                                <ul className="mt-3 divide-y divide-[#E3E8F0] dark:divide-white/10">
                                    {estado.historico.map((h) => (
                                        <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                                            <span className="w-[86px] shrink-0 font-bold text-[#313C55] dark:text-white">{hora(h.criado_em, estado.agora)}</span>
                                            <span className="font-semibold text-[#313C55] dark:text-white">
                                                {h.sala} · {ROTULO_ACAO[h.acao]}
                                            </span>
                                            <span className="text-[#7A8396] dark:text-[#AEB9CF]">{h.usuario_nome || ""}</span>
                                            <span
                                                className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${
                                                    h.situacao === "concluido"
                                                        ? "bg-[#EEF5D6] text-[#2E7A12] dark:bg-[#3FBF7F]/15 dark:text-[#5FE09A]"
                                                        : andando(h)
                                                          ? "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]"
                                                          : "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/12 dark:text-[#FF9C92]"
                                                }`}
                                                title={h.resultado || ""}
                                            >
                                                {h.situacao === "concluido"
                                                    ? "Feito"
                                                    : h.situacao === "pendente"
                                                      ? "Aguardando"
                                                      : h.situacao === "executando"
                                                        ? "Executando"
                                                        : h.situacao === "expirado"
                                                          ? "Não chegou"
                                                          : "Com problema"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
