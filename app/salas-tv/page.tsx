"use client";

/**
 * Salas do Memorial (/salas-tv) — 6 TVs separadas (16/11/2026).
 *
 * Cada sala tem o PAINEL de fora (QR Code) e a TV de dentro (mensagens). Cada uma das 6 TVs tem
 * os próprios botões (Ligar / Desligar / Atualizar e, nas de dentro, o som). Na linha da sala ficam
 * atalhos discretos para ligar/desligar as duas de uma vez.
 *
 * O app não fala com as TVs: grava o pedido em salas_tv.php ({tv} ou {sala}); o agente do PC do
 * Memorial busca, executa na rede local e devolve o andamento/resultado. Esta tela só acompanha:
 * - 19/11/2026 (teste do tempo real): a tela ouve o canal pai-app:salas-tv (useCanalApp) e só busca o estado
 *   quando o servidor avisa que algo mudou (pedido criado, recebido, andamento, resultado, estado das TVs).
 *   Com o tempo real ligado, a consulta fica só de segurança, a cada 30 s (cobre o Memorial ficar offline).
 * - sem o tempo real (Ably fora ou não configurada): como antes, estado a cada 10 s; 1 s logo depois de um
 *   clique e enquanto houver pedido andando; pausa com a aba escondida;
 * - "Memorial online/offline" pelo último sinal do agente (botões desativados offline).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCanalApp } from "@/lib/tempo-real/useCanalApp";
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

type Pedido = {
    id: number;
    sala?: string;
    tv?: string | null;
    acao: Acao;
    valor: number | null;
    situacao: Situacao;
    resultado: string | null;
    usuario_nome: string | null;
    criado_em: string;
    concluido_em: string | null;
};

type TV = {
    tv: string;
    sala: string;
    papel: "painel" | "dentro";
    estado: EstadoTV;
    volume: number | null;
    volume_max: number | null;
    atualizado_em: string | null;
    ultimo_pedido: Pedido | null;
};

type Estado = {
    agente: { online: boolean; visto_em: string | null; segundos: number | null };
    pedido_por_tv?: boolean;
    tvs?: TV[];
    historico: Pedido[];
    agora: string;
};

/** Alvo de um pedido: uma TV ou a sala inteira. */
type Alvo = { tv: string } | { sala: string };
const chaveAlvo = (a: Alvo) => ("tv" in a ? a.tv : `${a.sala}#sala`);

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

function segundosEntre(a: string | null | undefined, b: string | null | undefined) {
    if (!a || !b) return Infinity;
    const pa = Date.parse(a.replace(" ", "T"));
    const pb = Date.parse(b.replace(" ", "T"));
    return Number.isFinite(pa) && Number.isFinite(pb) ? Math.abs(pb - pa) / 1000 : Infinity;
}

const ROTULO_ACAO: Record<Acao, string> = { ligar: "Ligar", desligar: "Desligar", atualizar: "Atualizar", volume: "Volume" };

const TEXTO_ESTADO: Record<EstadoTV, { txt: string; ponto: string; cor: string }> = {
    ligada: { txt: "Ligada", ponto: "bg-[#3FBF7F] shadow-[0_0_8px_#3FBF7F]", cor: "text-[#2E8B5B] dark:text-[#5FE09A]" },
    tela_apagada: { txt: "Tela apagada", ponto: "bg-[#F2CB3F]", cor: "text-[#8A6D00] dark:text-[#F2CB3F]" },
    desligada: { txt: "Desligada", ponto: "bg-[#A3ACBD] dark:bg-[#5A6580]", cor: "text-[#5B6478] dark:text-[#AEB9CF]" },
    sem_controle: { txt: "Na rede, sem controle", ponto: "bg-[#F2CB3F]", cor: "text-[#8A6D00] dark:text-[#F2CB3F]" },
    nao_autorizada: { txt: "Falta autorizar o PC", ponto: "bg-[#E5484D]", cor: "text-[#B42318] dark:text-[#FF9C92]" },
    desconhecida: { txt: "Sem informação", ponto: "bg-[#A3ACBD] dark:bg-[#5A6580]", cor: "text-[#5B6478] dark:text-[#AEB9CF]" },
};

const BTN_BASE =
    "inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-[15px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIM = `${BTN_BASE} bg-[#313C55] text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]`;
const BTN_SEC = `${BTN_BASE} border border-[#C9D1DE] bg-[#FFFFFF] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/8`;
const BTN_PERIGO = `${BTN_BASE} border border-[#F1B5AE] bg-[#FFFFFF] text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92]/40 dark:bg-transparent dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10`;
const BTN_MINI =
    "inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50";

/* ============================== confirmação ============================== */

function Confirmar({ titulo, texto, onSim, onNao }: { titulo: string; texto: string; onSim: () => void; onNao: () => void }) {
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
                <h2 className="text-[20px] font-extrabold text-[#313C55] dark:text-white">{titulo}</h2>
                <p className="mt-2 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">{texto}</p>
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

/* ============================== cartão de UMA TV ============================== */

function CartaoTV({
    t,
    online,
    agora,
    enviando,
    salaOcupada,
    onAcao,
    onDesligar,
}: {
    t: TV;
    online: boolean;
    agora: string;
    enviando: boolean;
    salaOcupada: boolean;
    onAcao: (alvo: Alvo, acao: Acao, valor?: number) => void;
    onDesligar: (alvo: Alvo, titulo: string, texto: string) => void;
}) {
    const p = t.ultimo_pedido;
    const ocupado = enviando || salaOcupada || andando(p);
    const bloqueado = !online || ocupado;
    const e = TEXTO_ESTADO[t.estado] ?? TEXTO_ESTADO.desconhecida;
    const dentro = t.papel === "dentro";

    const volMax = t.volume_max || 15;
    const [vol, setVol] = useState<number | null>(t.volume);
    const arrastando = useRef(false);
    useEffect(() => {
        if (!arrastando.current) setVol(t.volume);
    }, [t.volume]);
    const enviarVolume = () => {
        if (!arrastando.current) return;
        arrastando.current = false;
        if (vol != null && vol !== t.volume) onAcao({ tv: t.tv }, "volume", vol);
    };

    // Resultado recente (até 3 min) do último pedido que não seja volume.
    const recente = p && !andando(p) && p.acao !== "volume" && segundosEntre(p.concluido_em || p.criado_em, agora) < 180 ? p : null;

    const borda =
        ocupado
            ? "border-[#F2CB3F] dark:border-[#F2CB3F]/60"
            : t.estado === "ligada"
                ? "border-[#7BA11A]/60 dark:border-[#3FBF7F]/40"
                : t.estado === "sem_controle" || t.estado === "nao_autorizada" || t.estado === "tela_apagada"
                    ? "border-[#E4C766] dark:border-[#F2CB3F]/40"
                    : "border-[#E3E8F0] dark:border-white/12";

    const desligarTv = () =>
        onDesligar({ tv: t.tv }, `Desligar ${t.tv}?`, `${dentro ? "A TV de dentro" : "O painel de fora"} da ${t.sala} será desligado.`);

    return (
        <section className={`flex flex-col gap-3 rounded-3xl border-2 bg-[#FFFFFF] p-4 dark:bg-[#232B3F] sm:p-5 ${borda}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#7A8396] dark:text-[#AEB9CF]">
                        <IconDeviceTv size={14} stroke={2} /> {dentro ? "TV de dentro" : "Painel de fora"}
                    </div>
                    <h3 className="mt-0.5 truncate text-[22px] font-black tracking-wide text-[#313C55] dark:text-white">{t.tv}</h3>
                </div>
                <div className={`mt-1 flex shrink-0 items-center gap-2 text-[14px] font-extrabold ${ocupado ? "text-[#8A6D00] dark:text-[#F2CB3F]" : e.cor}`}>
                    {ocupado ? <IconLoader2 size={14} className="animate-spin" /> : <span className={`size-2.5 rounded-full ${e.ponto}`} />}
                    {ocupado ? "Aguarde…" : e.txt}
                </div>
            </div>

            {(enviando || andando(p)) && (
                <div className="flex items-start gap-2 rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    <IconLoader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
                    <span>
                        {enviando || !p
                            ? "Enviando para o Memorial…"
                            : p.situacao === "pendente"
                                ? `${ROTULO_ACAO[p.acao]}${p.tv ? "" : " (sala)"}: aguardando o Memorial…`
                                : `${ROTULO_ACAO[p.acao]}${p.tv ? "" : " (sala)"}: ${p.resultado || "executando…"}`}
                    </span>
                </div>
            )}
            {salaOcupada && !enviando && !andando(p) && (
                <div className="flex items-start gap-2 rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    <IconLoader2 size={18} className="mt-0.5 shrink-0 animate-spin" /> Enviando pedido da sala…
                </div>
            )}
            {recente && !ocupado && (
                <div
                    className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${recente.situacao === "concluido"
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
            {!ocupado && !recente && t.estado === "sem_controle" && (
                <div className="rounded-xl bg-[#FCF3CC] px-3 py-2.5 text-[14px] font-semibold text-[#8A6D00] dark:bg-[#F2CB3F]/16 dark:text-[#F2CB3F]">
                    Na rede, mas sem a depuração (ADB): ative de novo em Opções do desenvolvedor da TV. Acontece na TCL depois de queda de energia.
                </div>
            )}
            {!ocupado && !recente && t.estado === "nao_autorizada" && (
                <div className="rounded-xl bg-[#FDECEA] px-3 py-2.5 text-[14px] font-semibold text-[#B42318] dark:bg-[#FF9C92]/12 dark:text-[#FF9C92]">
                    Aceite na TV &quot;Permitir depuração&quot; → &quot;Sempre permitir deste computador&quot;.
                </div>
            )}

            {dentro && (
                <div className={`flex items-center gap-3 ${t.estado !== "ligada" || vol == null ? "opacity-45" : ""}`}>
                    <IconVolume size={20} className="shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                    <span className="shrink-0 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Som</span>
                    <input
                        type="range"
                        aria-label={`Volume da ${t.tv}`}
                        min={0}
                        max={volMax}
                        value={vol ?? 0}
                        disabled={bloqueado || t.estado !== "ligada" || vol == null}
                        onChange={(ev) => {
                            arrastando.current = true;
                            setVol(Number(ev.target.value));
                        }}
                        onPointerUp={enviarVolume}
                        onKeyUp={enviarVolume}
                        onBlur={enviarVolume}
                        className="h-11 min-w-0 flex-1 accent-[#313C55] dark:accent-[#F2CB3F]"
                    />
                    <b className="w-11 shrink-0 text-right text-[14px] text-[#313C55] dark:text-white">
                        {vol == null || t.estado !== "ligada" ? "—" : `${Math.round((vol / volMax) * 100)}%`}
                    </b>
                </div>
            )}

            <div className="mt-auto grid grid-cols-2 gap-3">
                {t.estado === "ligada" ? (
                    <>
                        <button type="button" className={BTN_SEC} disabled={bloqueado} onClick={() => onAcao({ tv: t.tv }, "atualizar")}>
                            <IconRefresh size={18} stroke={2} /> Atualizar
                        </button>
                        <button type="button" className={BTN_PERIGO} disabled={bloqueado} onClick={desligarTv}>
                            <IconPower size={18} stroke={2} /> Desligar
                        </button>
                    </>
                ) : t.estado === "desligada" || t.estado === "desconhecida" ? (
                    <button type="button" className={`${BTN_PRIM} col-span-2`} disabled={bloqueado} onClick={() => onAcao({ tv: t.tv }, "ligar")}>
                        <IconPower size={19} stroke={2.2} /> LIGAR
                    </button>
                ) : (
                    <>
                        <button type="button" className={BTN_PRIM} disabled={bloqueado} onClick={() => onAcao({ tv: t.tv }, "ligar")}>
                            <IconPower size={18} stroke={2} /> Ligar
                        </button>
                        <button type="button" className={BTN_PERIGO} disabled={bloqueado} onClick={desligarTv}>
                            Desligar
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}

/* ============================== página ============================== */

export default function SalasTvPage() {
    const [estado, setEstado] = useState<Estado | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [enviando, setEnviando] = useState<Record<string, boolean>>({});
    const [confirmar, setConfirmar] = useState<{ alvo: Alvo; titulo: string; texto: string } | null>(null);
    const [rapido, setRapido] = useState(false); // consulta a cada 1 s logo depois de um clique
    const rapidoTimer = useRef<number | null>(null);
    useEffect(
        () => () => {
            if (rapidoTimer.current) window.clearTimeout(rapidoTimer.current);
        },
        [],
    );
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

    // Tempo real (19/11/2026): o servidor avisa quando algo muda; a tela busca o estado só nessa hora.
    const { conectado: aoVivo } = useCanalApp({ tokenUrl: `${API}?action=tempo_real`, onAviso: () => void carregar() });

    const temAndamento = !!estado?.tvs?.some((t) => andando(t.ultimo_pedido)) || Object.values(enviando).some(Boolean);
    useEffect(() => {
        carregar();
        // Ao vivo: só a consulta de segurança (30 s). Sem o tempo real: como antes (1 s com pedido andando, 10 s parado).
        const intervalo = aoVivo ? 30000 : rapido || temAndamento ? 1000 : 10000;
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible") carregar();
        }, intervalo);
        const voltou = () => document.visibilityState === "visible" && carregar();
        document.addEventListener("visibilitychange", voltou);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", voltou);
        };
    }, [carregar, temAndamento, rapido, aoVivo]);

    const pedir = useCallback(
        async (alvo: Alvo, acao: Acao, valor?: number) => {
            const chave = chaveAlvo(alvo);
            setAviso("");
            setEnviando((m) => ({ ...m, [chave]: true }));
            setRapido(true);
            if (rapidoTimer.current) window.clearTimeout(rapidoTimer.current);
            rapidoTimer.current = window.setTimeout(() => setRapido(false), 20000);
            try {
                await apiJson(`${API}?action=pedir`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...alvo, acao, valor }),
                });
            } catch (e) {
                setAviso(e instanceof Error ? e.message : "Não foi possível enviar o pedido.");
            } finally {
                await carregar();
                setEnviando((m) => ({ ...m, [chave]: false }));
            }
        },
        [carregar],
    );

    const pedirDesligar = useCallback((alvo: Alvo, titulo: string, texto: string) => setConfirmar({ alvo, titulo, texto }), []);
    const fecharConfirmar = useCallback(() => setConfirmar(null), []);

    const agente = estado?.agente;
    const online = !!agente?.online;
    const tvs = estado?.tvs ?? [];
    const salas = Array.from(new Set(tvs.map((t) => t.sala)));

    return (
        <main className="min-h-full bg-[#F6F8FB] px-4 pb-28 pt-5 dark:bg-[#161C2A] lg:px-8 lg:pb-10 lg:pt-8">
            <div className="mx-auto max-w-[1360px]">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-[24px] font-extrabold text-[#313C55] dark:text-white lg:text-[28px]">Salas do Memorial</h1>
                        <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                            As 6 TVs: o painel de fora e a TV de dentro de cada sala.
                        </p>
                        {/* Teste do tempo real (19/11/2026): mostra como a tela está se atualizando. */}
                        <p className="mt-0.5 text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">
                            {aoVivo ? "Atualização ao vivo" : "Atualização a cada 10 s"}
                        </p>
                    </div>
                    {estado && (
                        <div
                            className={`inline-flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-[13px] font-extrabold sm:self-auto ${online
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
                {estado && estado.pedido_por_tv === false && (
                    <div className="mt-4 rounded-2xl border border-[#E4C766] bg-[#FCF3CC] px-4 py-3 text-[14px] font-semibold text-[#8A6D00] dark:border-[#F2CB3F]/30 dark:bg-[#F2CB3F]/10 dark:text-[#F2CB3F]">
                        Falta rodar o salas_tv_6tvs.sql no banco para comandar cada TV separadamente.
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
                        <IconLoader2 size={20} className="animate-spin" /> Carregando as TVs…
                    </div>
                )}
                {estado && !estado.tvs && (
                    <div className="mt-6 rounded-2xl border border-[#E4C766] bg-[#FCF3CC] px-4 py-3 text-[14px] font-semibold text-[#8A6D00]">
                        Atualize o salas_tv.php na HostGator para ver as 6 TVs.
                    </div>
                )}

                {estado && tvs.length > 0 && (
                    <>
                        <div className="mt-5 grid gap-6 lg:mt-6 xl:grid-cols-3 xl:gap-5">
                            {salas.map((sala) => {
                                const daSala = tvs.filter((t) => t.sala === sala);
                                const painel = daSala.find((t) => t.papel === "painel");
                                const dentroTv = daSala.find((t) => t.papel === "dentro");
                                const enviandoSala = !!enviando[`${sala}#sala`];
                                const algumAndando = daSala.some((t) => andando(t.ultimo_pedido) || enviando[t.tv]) || enviandoSala;
                                const todasLigadas = daSala.every((t) => t.estado === "ligada");
                                const todasDesligadas = daSala.every((t) => t.estado === "desligada" || t.estado === "desconhecida");
                                return (
                                    <div key={sala} className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between gap-3 px-1">
                                            <h2 className="text-[13px] font-extrabold uppercase tracking-[.12em] text-[#5B6478] dark:text-[#AEB9CF]">{sala}</h2>
                                            <div className="flex gap-2">
                                                {!todasLigadas && (
                                                    <button
                                                        type="button"
                                                        className={`${BTN_MINI} text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/8`}
                                                        disabled={!online || algumAndando}
                                                        onClick={() => pedir({ sala }, "ligar")}
                                                    >
                                                        <IconPower size={16} stroke={2} /> Ligar as duas
                                                    </button>
                                                )}
                                                {!todasDesligadas && (
                                                    <button
                                                        type="button"
                                                        className={`${BTN_MINI} text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10`}
                                                        disabled={!online || algumAndando}
                                                        onClick={() =>
                                                            pedirDesligar({ sala }, `Desligar a ${sala}?`, "O painel de fora e a TV de dentro serão desligados.")
                                                        }
                                                    >
                                                        Desligar as duas
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                            {[painel, dentroTv].map((t) =>
                                                t ? (
                                                    <CartaoTV
                                                        key={t.tv}
                                                        t={t}
                                                        online={online}
                                                        agora={estado.agora}
                                                        enviando={!!enviando[t.tv]}
                                                        salaOcupada={enviandoSala}
                                                        onAcao={pedir}
                                                        onDesligar={pedirDesligar}
                                                    />
                                                ) : null,
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
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
                                                {h.tv || `${h.sala} (as duas)`} · {ROTULO_ACAO[h.acao]}
                                            </span>
                                            <span className="text-[#7A8396] dark:text-[#AEB9CF]">{h.usuario_nome || ""}</span>
                                            <span
                                                className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${h.situacao === "concluido"
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

            {confirmar && (
                <Confirmar
                    titulo={confirmar.titulo}
                    texto={confirmar.texto}
                    onNao={fecharConfirmar}
                    onSim={() => {
                        const alvo = confirmar.alvo;
                        setConfirmar(null);
                        pedir(alvo, "desligar");
                    }}
                />
            )}
        </main>
    );
}
