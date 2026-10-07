/**
 * Tempo real do Messenger: UMA conexão Ably por aba do navegador, usada pela tela e pelo contador do menu.
 * (06/10/2026: volta da Ably no lugar da consulta a cada 5 s; requer `npm install ably`.)
 *
 * - Escuta o canal do próprio usuário (pai-msg:usuario:<id>). A credencial vem do messenger.php (ably_token).
 * - Modo de segurança: se a Ably ficar fora por mais de 10 s (ou não estiver configurada), consulta
 *   messenger.php?action=novidades a cada 5 s (30 s com o app em segundo plano) e entrega os mesmos eventos.
 * - Ao reconectar, ao voltar ao app e ao entrar no modo de segurança, ressincroniza pelo MySQL.
 *
 * - Notificações (quando o servidor usa notificacoes_canal = 'ably'): a MESMA conexão registra este aparelho no
 *   Web Push da Ably (service worker /push/ably/sw.js). O servidor manda UMA notificação por mensagem, só por esse
 *   canal; o OneSignal não manda nada do Messenger. Ver ativarNotificacoes().
 *
 * Eventos entregues aos ouvintes: mensagem, mensagem_apagada, leitura, digitando, status_envio, conversa.
 */
import * as Ably from "ably";
import Push from "ably/push";
import { msgGet } from "./api";

/** Service worker só das notificações do Messenger (escopo próprio /push/ably/, separado do OneSignal). */
export const SW_NOTIFICACOES = "/push/ably/sw.js";
const CHAVE_DONO = "pai.messenger.push.dono"; // de quem é a ativação deste aparelho (evita notificar o usuário errado)

export type EstadoNotificacoes = "desligadas" | "ativas" | "pendente" | "negadas" | "sem_suporte" | "erro";
const ouvintesNotif = new Set<(e: EstadoNotificacoes, detalhe?: string) => void>();
let estadoNotif: EstadoNotificacoes = "desligadas";
let detalheNotif = "";
let canalNotificacoes = "";
let meuId = 0;

export type EventoTempoReal = { nome: string; dados: any };
type Ouvinte = (e: EventoTempoReal) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesSeguranca = new Set<(ativo: boolean) => void>();
let iniciado = false;
let cliente: any = null;
let ultimoId = 0;
let servidorEm = "";
let seguranca = false;
let timerQueda: ReturnType<typeof setTimeout> | null = null;
let timerConsulta: ReturnType<typeof setTimeout> | null = null;
let sincronizando = false;

function emitir(nome: string, dados: any) {
    if (nome === "mensagem" && dados?.id && dados.id > ultimoId) ultimoId = dados.id;
    ouvintes.forEach((f) => {
        try {
            f({ nome, dados });
        } catch (e) {
            console.error("[messenger] ouvinte:", e);
        }
    });
}

function definirSeguranca(ativo: boolean) {
    if (seguranca === ativo) return;
    seguranca = ativo;
    ouvintesSeguranca.forEach((f) => f(ativo));
    if (ativo) agendarConsulta(0);
    else if (timerConsulta) {
        clearTimeout(timerConsulta);
        timerConsulta = null;
    }
}

function agendarConsulta(ms: number) {
    if (timerConsulta) clearTimeout(timerConsulta);
    timerConsulta = setTimeout(async () => {
        await sincronizar();
        if (seguranca) agendarConsulta(document.visibilityState === "visible" ? 5000 : 30000);
    }, ms);
}

/** Busca no MySQL tudo o que chegou depois do último id conhecido e entrega como eventos. */
export async function sincronizar() {
    if (sincronizando || typeof window === "undefined") return;
    sincronizando = true;
    try {
        for (let volta = 0; volta < 5; volta++) {
            const d: any = await msgGet("novidades", { desde_id: ultimoId, desde_em: servidorEm }, false);
            servidorEm = d.servidor_em || servidorEm;
            (d.mensagens || []).forEach((m: any) => emitir("mensagem", m));
            (d.apagadas || []).forEach((a: any) => emitir("mensagem_apagada", a));
            if (d.ultimo_id > ultimoId) ultimoId = d.ultimo_id;
            if (!d.tem_mais) break;
        }
    } catch (e) {
        console.warn("[messenger] falha ao sincronizar:", e);
    } finally {
        sincronizando = false;
    }
}

async function iniciar() {
    if (iniciado || typeof window === "undefined") return;
    iniciado = true;
    try {
        const marco: any = await msgGet("novidades", { desde_id: -1 }, false);
        ultimoId = marco.ultimo_id || 0;
        servidorEm = marco.servidor_em || "";
    } catch {
        /* segue; a primeira consulta acerta o marcador */
    }
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") sincronizar();
    });
    let perfil: any = null;
    try {
        perfil = await msgGet("perfil", {}, false);
    } catch {
        definirSeguranca(true);
        return;
    }
    if (!perfil?.tempo_real) {
        definirSeguranca(true); // Ably não configurada: só consulta ao MySQL
        return;
    }
    meuId = Number(perfil.id) || 0;
    canalNotificacoes = String(perfil.notificacoes_canal || "");
    cliente = new Ably.Realtime({
        authCallback: async (_params: any, callback: any) => {
            try {
                callback(null, await msgGet("ably_token", {}, false));
            } catch (e: any) {
                callback(e?.message || "Falha na credencial", null);
            }
        },
        pushServiceWorkerUrl: SW_NOTIFICACOES,
        plugins: { Push },
    } as any);
    if (canalNotificacoes === "ably") prepararNotificacoes();
    const canal = cliente.channels.get(`pai-msg:usuario:${perfil.id}`);
    canal.subscribe((m: any) => emitir(m.name, m.data));
    cliente.connection.on((mudanca: any) => {
        if (mudanca.current === "connected") {
            if (timerQueda) {
                clearTimeout(timerQueda);
                timerQueda = null;
            }
            sincronizar(); // cobre o que chegou enquanto estava desconectado
            definirSeguranca(false);
        } else if (["disconnected", "suspended", "failed"].includes(mudanca.current)) {
            if (!timerQueda && !seguranca) {
                timerQueda = setTimeout(() => {
                    timerQueda = null;
                    definirSeguranca(true);
                }, 10000);
            }
        }
    });
}

/** Recebe os eventos do Messenger. Devolve a função para parar de ouvir. */
export function ouvir(fn: Ouvinte): () => void {
    ouvintes.add(fn);
    iniciar();
    return () => {
        ouvintes.delete(fn);
    };
}

/** Avisa quando entra ou sai do modo de segurança (Ably fora do ar). */
export function ouvirSeguranca(fn: (ativo: boolean) => void): () => void {
    ouvintesSeguranca.add(fn);
    fn(seguranca);
    iniciar();
    return () => {
        ouvintesSeguranca.delete(fn);
    };
}

/** A tela informa os ids que já carregou (para a ressincronização começar do ponto certo). */
export function registrarId(id: number) {
    if (id > ultimoId) ultimoId = id;
}

/* ------------------------------------------------------------------ */
/* Notificações pela Ably (Web Push)                                   */
/* ------------------------------------------------------------------ */

function definirEstadoNotif(e: EstadoNotificacoes, detalhe = "") {
    estadoNotif = e;
    detalheNotif = detalhe;
    ouvintesNotif.forEach((f) => f(e, detalhe));
}

/**
 * O OneSignalInit.tsx (não alterado) força o escopo /push/onesignal/ em todo registro de service worker.
 * Esta função ACRESCENTA um desvio só para o service worker do Messenger (/push/ably/): ele é registrado pelo
 * método original do navegador, no próprio escopo. Qualquer outro registro segue exatamente como antes.
 * Funciona nas duas ordens: se o OneSignal embrulhar este desvio depois, o endereço /push/ably/ ainda é reconhecido aqui.
 */
let desvioInstalado = false;
function garantirEscopoAbly() {
    if (desvioInstalado || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const original = (window as any).ServiceWorkerContainer?.prototype?.register;
    if (typeof original !== "function") return;
    desvioInstalado = true;
    const sw: any = navigator.serviceWorker;
    const anterior = sw.register;
    sw.register = function (this: any, url: any, opts?: any) {
        if (String(url || "").includes("/push/ably/")) {
            return registrarAtivo(original.call(sw, url, { ...(opts || {}), scope: "/push/ably/" }));
        }
        return anterior.call(this ?? sw, url, opts);
    };
}

/** Devolve o registro só quando o service worker já está ativo (a Ably espera por isso antes de assinar o Web Push). */
async function registrarAtivo(p: Promise<ServiceWorkerRegistration>): Promise<ServiceWorkerRegistration> {
    const reg = await p;
    const w = reg.active ? null : reg.installing || reg.waiting;
    if (w) {
        await new Promise<void>((ok) => {
            const limite = setTimeout(ok, 10000);
            w.addEventListener("statechange", () => {
                if (w.state === "activated") {
                    clearTimeout(limite);
                    ok();
                }
            });
        });
    }
    return reg;
}

function suportaPush(): boolean {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Ao abrir o app: se a permissão já foi dada, ativa sozinho (sem pedir nada). Se este aparelho estava ativado para
 * OUTRO usuário (troca de login no mesmo aparelho), desativa antes, para as notificações dele não chegarem aqui.
 */
async function prepararNotificacoes() {
    if (!suportaPush()) return definirEstadoNotif("sem_suporte");
    garantirEscopoAbly();
    if (Notification.permission === "denied") return definirEstadoNotif("negadas");
    const dono = localStorage.getItem(CHAVE_DONO);
    if (dono && dono !== String(meuId)) {
        try {
            await cliente.push.deactivate();
        } catch {
            /* segue: a ativação abaixo registra de novo */
        }
        localStorage.removeItem(CHAVE_DONO);
    }
    if (Notification.permission === "granted") await ativarNotificacoes();
    else definirEstadoNotif("pendente");
}

/**
 * Ativa as notificações do Messenger neste aparelho (pede a permissão se preciso).
 * No iPhone, chamar a partir de um toque (botão) e com o app instalado na tela de início.
 */
export async function ativarNotificacoes(): Promise<EstadoNotificacoes> {
    if (canalNotificacoes !== "ably" || !cliente) return estadoNotif;
    if (!suportaPush()) {
        definirEstadoNotif("sem_suporte");
        return estadoNotif;
    }
    garantirEscopoAbly();
    try {
        if (cliente.connection.state !== "connected") {
            // o clientId do usuário vem no token: espera a conexão (no máximo 15 s)
            await Promise.race([
                new Promise<void>((ok) => cliente.connection.once("connected", () => ok())),
                new Promise<void>((_, falha) => setTimeout(() => falha(new Error("Sem conexão com o tempo real.")), 15000)),
            ]);
        }
        await cliente.push.activate();
        localStorage.setItem(CHAVE_DONO, String(meuId));
        definirEstadoNotif("ativas");
    } catch (e: any) {
        if (typeof Notification !== "undefined" && Notification.permission === "denied") definirEstadoNotif("negadas");
        else if (typeof Notification !== "undefined" && Notification.permission === "default") definirEstadoNotif("pendente");
        else definirEstadoNotif("erro", e?.message || "Falha ao ativar as notificações.");
        console.warn("[messenger] notificações:", e);
    }
    return estadoNotif;
}

/** Ao sair da conta: desliga as notificações deste aparelho (chamar antes de apagar a sessão). */
export async function desativarNotificacoes() {
    try {
        if (cliente && canalNotificacoes === "ably") await cliente.push.deactivate();
    } catch {
        /* sem conexão: na próxima abertura o app desativa (dono diferente) */
    }
    try {
        localStorage.removeItem(CHAVE_DONO);
    } catch {
        /* sem armazenamento */
    }
    definirEstadoNotif("desligadas");
}

/** Acompanha o estado das notificações deste aparelho (para o aviso "Ativar notificações" na tela). */
export function ouvirNotificacoes(fn: (e: EstadoNotificacoes, detalhe?: string) => void): () => void {
    ouvintesNotif.add(fn);
    fn(estadoNotif, detalheNotif);
    iniciar();
    return () => {
        ouvintesNotif.delete(fn);
    };
}
