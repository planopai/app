/**
 * tempoReal.ts — versão oficial SEM o pacote "ably" (decisão de 05/10/2026: o Messenger não usa a Ably).
 *
 * Os nomes exportados são os mesmos de antes (EventoTempoReal, sincronizar, ouvir, ouvirSeguranca, registrarId), então
 * ContadorMenu.tsx e app/messenger/page.tsx não mudam.
 *
 * Como funciona: consulta messenger.php?action=novidades a cada 5 s (30 s com o app em segundo plano) e entrega os mesmos
 * eventos. Mensagens chegam com até ~5 s de atraso. Retire "ably" do package.json (npm uninstall ably).
 */
import { msgGet } from "./api";

export type EventoTempoReal = { nome: string; dados: any };
type Ouvinte = (e: EventoTempoReal) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesSeguranca = new Set<(ativo: boolean) => void>();
let iniciado = false;
let ultimoId = 0;
let servidorEm = "";
let seguranca = false;
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
    definirSeguranca(true); // sem Ably: só consulta ao MySQL
}

/** Recebe os eventos do Messenger. Devolve a função para parar de ouvir. */
export function ouvir(fn: Ouvinte): () => void {
    ouvintes.add(fn);
    iniciar();
    return () => {
        ouvintes.delete(fn);
    };
}

/** Avisa quando entra ou sai do modo de segurança (aqui, sempre ativo). */
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
