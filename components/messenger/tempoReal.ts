/**
 * Atualização do Messenger SEM a Ably (decisão de 05/10/2026: a Ably não será usada).
 *
 * Substitui o tempoReal.ts anterior mantendo os MESMOS nomes exportados (EventoTempoReal, sincronizar, ouvir,
 * ouvirSeguranca, registrarId), então ContadorMenu.tsx, app/messenger/page.tsx e os demais arquivos NÃO mudam.
 * Não importa nenhum pacote externo: não precisa de `npm install ably`.
 *
 * Como funciona
 *  - Consulta messenger.php?action=novidades a cada 5 s com a tela visível e a cada 30 s em segundo plano,
 *    e entrega aos ouvintes os eventos "mensagem" e "mensagem_apagada" (os mesmos de antes).
 *  - Com a tela visível, a cada 30 s também entrega um evento "conversa": a lista de conversas e o contador do menu
 *    recarregam (cobre leituras feitas em outro aparelho, transferências e mudanças na fila).
 *  - Ao voltar para a aba, ao voltar a internet e ao abrir a tela, consulta na hora.
 *  - Só consulta enquanto houver alguém ouvindo (o contador do menu só ouve para quem tem a página `messenger`) e para
 *    sozinho quando o último ouvinte sai.
 *  - Se a consulta falhar várias vezes seguidas (sem sessão, sem permissão, servidor fora), espaça para 30 s e avisa uma vez no console.
 *  - `ouvirSeguranca` sempre informa `false`: não há mais "modo de segurança", então as faixas amarelas de "tempo real indisponível" não aparecem.
 *
 * O que muda para quem usa
 *  - As mensagens chegam com até ~5 s de atraso (antes eram instantâneas com a Ably).
 *  - "digitando…" e o "Lida" em tempo real não funcionam (eram eventos da Ably); a leitura aparece quando a conversa recarrega.
 *  - Carga no servidor: ~12 consultas leves por minuto por pessoa com a tela aberta. Ajuste com definirIntervalos() se precisar.
 *
 * Back-end: sem `ably_api_key` no pai-chaves.php o messenger.php não chama a Ably. Se a chave existir, remova a linha.
 */
import { msgGet } from "./api";

export type EventoTempoReal = { nome: string; dados: any };
type Ouvinte = (e: EventoTempoReal) => void;

let INTERVALO_VISIVEL_MS = 5000;
let INTERVALO_FUNDO_MS = 30000;
let INTERVALO_LISTAS_MS = 30000;
const INTERVALO_APOS_FALHAS_MS = 30000;
const FALHAS_PARA_ESPACAR = 3;
const CARENCIA_PARAR_MS = 2000;

const ouvintes = new Set<Ouvinte>();
const ouvintesSeguranca = new Set<(ativo: boolean) => void>();
let iniciado = false;
let ultimoId = 0;
let servidorEm = "";
let timerConsulta: ReturnType<typeof setTimeout> | null = null;
let timerParar: ReturnType<typeof setTimeout> | null = null;
let sincronizando = false;
let falhas = 0;
let avisouFalha = false;
let ultimaListaEm = 0;
let ligacoes = false;

/** Ajusta os intervalos (ms). Útil para aliviar o servidor ou para testes. */
export function definirIntervalos(visivel: number, fundo: number, listas: number = INTERVALO_LISTAS_MS) {
    INTERVALO_VISIVEL_MS = visivel;
    INTERVALO_FUNDO_MS = fundo;
    INTERVALO_LISTAS_MS = listas;
}

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

function visivel(): boolean {
    return typeof document === "undefined" || document.visibilityState === "visible";
}

function proximoIntervalo(): number {
    if (falhas >= FALHAS_PARA_ESPACAR) return INTERVALO_APOS_FALHAS_MS;
    return visivel() ? INTERVALO_VISIVEL_MS : INTERVALO_FUNDO_MS;
}

function agendar(ms: number) {
    if (timerConsulta) clearTimeout(timerConsulta);
    timerConsulta = setTimeout(ciclo, ms);
}

async function ciclo() {
    if (!iniciado) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        agendar(INTERVALO_FUNDO_MS);
        return;
    }
    await sincronizar();
    // a cada 30 s com a tela visível: faz as listas e o contador recarregarem
    if (iniciado && visivel() && Date.now() - ultimaListaEm >= INTERVALO_LISTAS_MS) {
        ultimaListaEm = Date.now();
        emitir("conversa", { conversa_id: 0, sintetico: true });
    }
    if (iniciado) agendar(proximoIntervalo());
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
        falhas = 0;
        avisouFalha = false;
    } catch (e) {
        falhas++;
        if (falhas >= FALHAS_PARA_ESPACAR && !avisouFalha) {
            avisouFalha = true;
            console.warn("[messenger] não consegui atualizar; vou tentar de novo a cada 30 s:", e);
        }
    } finally {
        sincronizando = false;
    }
}

function aoVoltarParaAba() {
    if (iniciado && visivel()) {
        sincronizar();
        agendar(proximoIntervalo());
    }
}

function aoVoltarInternet() {
    if (iniciado) {
        falhas = 0;
        sincronizar();
        agendar(proximoIntervalo());
    }
}

async function iniciar() {
    if (typeof window === "undefined") return;
    if (timerParar) {
        clearTimeout(timerParar);
        timerParar = null;
    }
    if (iniciado) return;
    iniciado = true;
    if (!ligacoes) {
        ligacoes = true;
        document.addEventListener("visibilitychange", aoVoltarParaAba);
        window.addEventListener("online", aoVoltarInternet);
    }
    try {
        const marco: any = await msgGet("novidades", { desde_id: -1 }, false);
        if (!ultimoId) ultimoId = marco.ultimo_id || 0;
        servidorEm = marco.servidor_em || servidorEm;
    } catch {
        /* segue; a primeira consulta acerta o marcador */
    }
    ultimaListaEm = Date.now();
    if (iniciado) agendar(proximoIntervalo());
}

function pararSeNinguemOuve() {
    if (ouvintes.size > 0 || ouvintesSeguranca.size > 0) return;
    if (timerParar) clearTimeout(timerParar);
    timerParar = setTimeout(() => {
        timerParar = null;
        if (ouvintes.size > 0 || ouvintesSeguranca.size > 0) return;
        iniciado = false;
        if (timerConsulta) {
            clearTimeout(timerConsulta);
            timerConsulta = null;
        }
        if (ligacoes) {
            ligacoes = false;
            document.removeEventListener("visibilitychange", aoVoltarParaAba);
            window.removeEventListener("online", aoVoltarInternet);
        }
    }, CARENCIA_PARAR_MS);
}

/** Recebe os eventos do Messenger. Devolve a função para parar de ouvir. */
export function ouvir(fn: Ouvinte): () => void {
    ouvintes.add(fn);
    iniciar();
    return () => {
        ouvintes.delete(fn);
        pararSeNinguemOuve();
    };
}

/** Compatibilidade: antes avisava o "modo de segurança" da Ably. Sem a Ably, informa sempre `false` (nenhuma faixa de aviso). */
export function ouvirSeguranca(fn: (ativo: boolean) => void): () => void {
    ouvintesSeguranca.add(fn);
    fn(false);
    iniciar();
    return () => {
        ouvintesSeguranca.delete(fn);
        pararSeNinguemOuve();
    };
}

/** A tela informa os ids que já carregou (para a ressincronização começar do ponto certo). */
export function registrarId(id: number) {
    if (id > ultimoId) ultimoId = id;
}
