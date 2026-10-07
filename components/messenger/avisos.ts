/**
 * Avisos do Messenger dentro do app (07/10/2026), em QUALQUER tela, sem depender da permissão de notificação:
 *
 * 1. App aberto e na tela: cada mensagem nova mostra um aviso no canto da tela (nome + prévia) e toca um som.
 *    Não avisa: mensagem minha, de sistema, de conversa silenciada, nem a da conversa que já está aberta.
 *    Com o app na tela, a notificação do OneSignal da mesma mensagem é escondida (não duplica).
 * 2. Celular com as notificações desligadas: sempre que o app é aberto (ou volta para a tela depois de
 *    1 minuto fora), aparece um alerta com as conversas que têm mensagens não lidas e o atalho para ativar
 *    as notificações.
 *
 * Feito em DOM simples (sem React) porque roda junto com o tempo real, que já está ligado em todas as telas
 * pelo contador do menu — assim nenhum arquivo comum do app (layout, app-shell, menu) precisa mudar.
 * Só silenciar a conversa (sino dentro dela) tira os avisos.
 */
import { msgGet } from "./api";
import type { Conversa, Mensagem } from "./tipos";

type Ouvir = (fn: (e: { nome: string; dados: any }) => void) => () => void;
type InfoConversa = { titulo: string; tipo: string; silenciada: boolean };

let ligado = false;
let eu = 0;
const conversas = new Map<number, InfoConversa>();
let carregadoEm = 0;
const jaAvisadas = new Set<number>();
let somCtx: AudioContext | null = null;
let escondidoDesde = 0;

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

const escuro = () => document.documentElement.classList.contains("dark");
const celular = () => window.matchMedia("(max-width: 1023px), (pointer: coarse)").matches;

function conversaAbertaNaTela(): number {
    if (document.visibilityState !== "visible") return 0;
    if (!window.location.pathname.startsWith("/messenger")) return 0;
    return Number(new URLSearchParams(window.location.search).get("conversa") || 0);
}

function previa(m: Mensagem): string {
    const texto = (m.texto || "").replace(/\s+/g, " ").trim();
    const anexo = m.anexos?.[0];
    let p = texto || "Nova mensagem";
    if (m.tipo === "imagem") p = "Foto" + (texto && !texto.startsWith("Enviando") ? `: ${texto}` : "");
    else if (m.tipo === "audio") {
        const s = anexo?.duracao_s || 0;
        p = "Áudio" + (s ? ` (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})` : "");
    } else if (m.tipo === "documento") p = "Documento" + (anexo?.nome_original ? `: ${anexo.nome_original}` : "");
    return p.length > 140 ? p.slice(0, 139) + "…" : p;
}

async function carregarConversas(forcar = false): Promise<Conversa[]> {
    if (!forcar && Date.now() - carregadoEm < 60000 && conversas.size) return [];
    try {
        const lista = await msgGet<Conversa[]>("conversas", {}, false);
        conversas.clear();
        lista.forEach((c) => conversas.set(c.id, { titulo: c.titulo, tipo: c.tipo, silenciada: !!c.silenciada }));
        carregadoEm = Date.now();
        return lista;
    } catch {
        return [];
    }
}

function abrirConversa(id: number) {
    window.location.href = `/messenger?conversa=${id}`;
}

/* ------------------------------------------------------------------ */
/* som (curto, dois tons). O navegador só libera áudio depois do        */
/* primeiro toque/clique na página.                                     */
/* ------------------------------------------------------------------ */

function liberarSom() {
    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        if (!somCtx) somCtx = new Ctx();
        if (somCtx && somCtx.state === "suspended") somCtx.resume().catch(() => {});
    } catch {
        /* sem som */
    }
}

function tocarSom() {
    const ctx = somCtx;
    if (!ctx || ctx.state !== "running") return;
    const agora = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, agora + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.18, agora + i * 0.13 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.13 + 0.12);
        o.connect(g).connect(ctx.destination);
        o.start(agora + i * 0.13);
        o.stop(agora + i * 0.13 + 0.14);
    });
}

/* ------------------------------------------------------------------ */
/* 1. aviso de mensagem nova (canto da tela)                           */
/* ------------------------------------------------------------------ */

function caixaAvisos(): HTMLElement {
    let el = document.getElementById("pai-msg-avisos");
    if (!el) {
        el = document.createElement("div");
        el.id = "pai-msg-avisos";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.style.cssText =
            "position:fixed;z-index:80;display:flex;flex-direction:column;gap:8px;pointer-events:none;" +
            (celular() ? "left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);" : "right:20px;top:20px;width:380px;");
        document.body.appendChild(el);
    }
    return el;
}

function mostrarAviso(conversaId: number, titulo: string, texto: string) {
    const caixa = caixaAvisos();
    while (caixa.children.length >= 3) caixa.firstElementChild?.remove();
    const dark = escuro();
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText =
        "pointer-events:auto;display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;text-align:left;cursor:pointer;" +
        "font-family:inherit;box-shadow:0 8px 24px rgba(31,38,56,.22);transition:opacity .25s,transform .25s;opacity:0;transform:translateY(-6px);" +
        (dark ? "background:#232B3F;color:#fff;border:1px solid rgba(255,255,255,.12);" : "background:#fff;color:#1F2638;border:1px solid #E1E5EC;");
    const icone = document.createElement("span");
    icone.style.cssText = `flex:none;width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:${dark ? "#3D6A99" : "#313C55"};color:#fff`;
    icone.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>';
    const corpo = document.createElement("span");
    corpo.style.cssText = "min-width:0;flex:1;display:flex;flex-direction:column;gap:2px";
    const t1 = document.createElement("span");
    t1.style.cssText = "font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    t1.textContent = titulo;
    const t2 = document.createElement("span");
    t2.style.cssText = `font-size:14px;color:${dark ? "#AEB9CF" : "#5B6478"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    t2.textContent = texto;
    corpo.append(t1, t2);
    b.append(icone, corpo);
    b.setAttribute("aria-label", `Nova mensagem de ${titulo}: ${texto}. Abrir conversa`);
    b.onclick = () => abrirConversa(conversaId);
    caixa.appendChild(b);
    requestAnimationFrame(() => {
        b.style.opacity = "1";
        b.style.transform = "none";
    });
    setTimeout(() => {
        b.style.opacity = "0";
        setTimeout(() => b.remove(), 300);
    }, 6000);
}

async function aoChegarMensagem(m: Mensagem) {
    if (!m?.id || jaAvisadas.has(m.id)) return;
    jaAvisadas.add(m.id);
    if (m.autor_tipo === "sistema" || (m.autor_tipo === "usuario" && m.autor_usuario_id === eu)) return;
    if (document.visibilityState !== "visible") return; // fora da tela: quem avisa é a notificação do aparelho
    if (conversaAbertaNaTela() === m.conversa_id) return; // já está lendo esta conversa
    await carregarConversas(false); // atualiza a lista guardada se tiver mais de 1 minuto
    let info = conversas.get(m.conversa_id);
    if (!info) {
        await carregarConversas(true);
        info = conversas.get(m.conversa_id);
    }
    if (info?.silenciada) return;
    const autor = m.autor_nome || "Nova mensagem";
    let titulo = autor;
    let texto = previa(m);
    if (info?.tipo === "grupo") {
        titulo = info.titulo || "Grupo";
        texto = `${autor.split(" ")[0]}: ${texto}`;
    } else if (info?.tipo === "externo") {
        titulo = `${info.titulo || autor} · Cliente`;
    }
    mostrarAviso(m.conversa_id, titulo, texto);
    tocarSom();
}

/** Com o app na tela, a notificação do OneSignal de mensagem do Messenger não aparece (o aviso acima já mostra). */
function esconderPushComAppNaTela() {
    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push((OS: any) => {
        OS?.Notifications?.addEventListener?.("foregroundWillDisplay", (ev: any) => {
            const dados = ev?.notification?.additionalData || {};
            if (dados.origem === "messenger" && document.visibilityState === "visible") ev.preventDefault?.();
        });
    });
}

/* ------------------------------------------------------------------ */
/* 2. alerta de não lidas ao abrir o app (celular sem notificações)    */
/* ------------------------------------------------------------------ */

function notificacoesLigadas(): boolean {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    const optou = (window as any).OneSignal?.User?.PushSubscription?.optedIn;
    return optou !== false;
}

function textoComoAtivar(): string {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (typeof Notification === "undefined") {
        return ios ? "No iPhone, as notificações só funcionam com o app instalado na tela de início (Compartilhar → Adicionar à Tela de Início)." : "Este navegador não recebe notificações.";
    }
    if (Notification.permission === "denied") {
        return ios ? "As notificações estão bloqueadas. Libere em Ajustes → Notificações → PAI." : "As notificações estão bloqueadas. Libere nas configurações do navegador para este site.";
    }
    return "Ative as notificações para receber as mensagens com o app fechado.";
}

async function pedirPermissao() {
    try {
        const OS = (window as any).OneSignal;
        if (OS?.Notifications?.requestPermission) await OS.Notifications.requestPermission();
        else if (typeof Notification !== "undefined") await Notification.requestPermission();
    } catch {
        /* o aparelho decide */
    }
}

async function alertaNaoLidas() {
    if (!celular() || notificacoesLigadas() || document.getElementById("pai-msg-alerta")) return;
    const lista = await carregarConversas(true);
    let fila = 0;
    try {
        fila = (await msgGet<any[]>("fila", {}, false)).length;
    } catch {
        fila = 0;
    }
    const pendentes = lista.filter((c) => c.nao_lidas > 0 && !c.silenciada).sort((a, b) => b.nao_lidas - a.nao_lidas);
    if (!pendentes.length && !fila) return;
    if (notificacoesLigadas() || document.getElementById("pai-msg-alerta")) return;

    const dark = escuro();
    const fundo = document.createElement("div");
    fundo.id = "pai-msg-alerta";
    fundo.style.cssText = "position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(31,38,56,.5)";
    const caixa = document.createElement("div");
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-modal", "true");
    caixa.setAttribute("aria-label", "Mensagens não lidas");
    caixa.style.cssText =
        "width:100%;max-width:560px;max-height:85vh;overflow:auto;border-radius:24px 24px 0 0;padding:22px 20px calc(env(safe-area-inset-bottom,0px) + 18px);font-family:inherit;" +
        (dark ? "background:#232B3F;color:#fff;" : "background:#fff;color:#1F2638;");
    const cinza = dark ? "#AEB9CF" : "#5B6478";

    const h = document.createElement("h2");
    h.style.cssText = "margin:0;font-size:21px;font-weight:800";
    h.textContent = "Você tem mensagens não lidas";
    const p = document.createElement("p");
    p.style.cssText = `margin:6px 0 14px;font-size:15px;color:${cinza}`;
    p.textContent = "As notificações deste aparelho estão desligadas, então os avisos não chegam com o app fechado.";
    caixa.append(h, p);

    const fechar = () => fundo.remove();
    const linha = (rotulo: string, detalhe: string, onClick: () => void) => {
        const b = document.createElement("button");
        b.type = "button";
        b.style.cssText = `display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:8px 10px;border:0;border-radius:14px;background:${dark ? "#1C2334" : "#F0F2F5"};color:inherit;text-align:left;cursor:pointer;margin-bottom:8px;font-family:inherit`;
        const nome = document.createElement("span");
        nome.style.cssText = "flex:1;min-width:0;font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        nome.textContent = rotulo;
        const qtd = document.createElement("span");
        qtd.style.cssText = "flex:none;min-width:26px;height:26px;padding:0 8px;box-sizing:border-box;border-radius:13px;background:#B3CE52;color:#1F2638;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center";
        qtd.textContent = detalhe;
        b.append(nome, qtd);
        b.onclick = () => {
            fechar();
            onClick();
        };
        caixa.appendChild(b);
    };
    if (fila) linha("Clientes aguardando na fila", String(fila), () => (window.location.href = "/messenger"));
    pendentes.slice(0, 8).forEach((c) => linha(c.titulo, c.nao_lidas > 99 ? "99+" : String(c.nao_lidas), () => abrirConversa(c.id)));
    if (pendentes.length > 8) linha(`Mais ${pendentes.length - 8} conversas`, "…", () => (window.location.href = "/messenger"));

    const dica = document.createElement("p");
    dica.style.cssText = `margin:10px 0 14px;font-size:14px;color:${cinza}`;
    dica.textContent = textoComoAtivar();
    caixa.appendChild(dica);

    const botoes = document.createElement("div");
    botoes.style.cssText = "display:flex;gap:10px";
    const agoraNao = document.createElement("button");
    agoraNao.type = "button";
    agoraNao.textContent = "Agora não";
    agoraNao.style.cssText = `flex:1;height:48px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;background:transparent;color:inherit;border:1px solid ${dark ? "rgba(255,255,255,.25)" : "#C9D1DE"}`;
    agoraNao.onclick = fechar;
    botoes.appendChild(agoraNao);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
        const ativar = document.createElement("button");
        ativar.type = "button";
        ativar.textContent = "Ativar notificações";
        ativar.style.cssText = `flex:1;height:48px;border-radius:14px;border:0;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;color:#fff;background:${dark ? "#3D6A99" : "#313C55"}`;
        ativar.onclick = async () => {
            await pedirPermissao();
            if (notificacoesLigadas()) fechar();
        };
        botoes.appendChild(ativar);
    }
    caixa.appendChild(botoes);
    fundo.appendChild(caixa);
    fundo.addEventListener("click", (e) => e.target === fundo && fechar());
    document.body.appendChild(fundo);
}

/* ------------------------------------------------------------------ */
/* ligação (chamada uma vez pelo tempoReal.ts, depois do perfil)       */
/* ------------------------------------------------------------------ */

export function iniciarAvisos(opcoes: { eu: number; ouvir: Ouvir }) {
    if (ligado || typeof window === "undefined") return;
    ligado = true;
    eu = opcoes.eu;
    carregarConversas(true);
    esconderPushComAppNaTela();
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, liberarSom, { passive: true }));

    opcoes.ouvir(({ nome, dados }) => {
        if (nome === "mensagem") aoChegarMensagem(dados as Mensagem);
        else if (nome === "conversa") carregarConversas(true); // renomeada, nova, transferida...
    });
    // a tela do Messenger avisa na hora quando a pessoa silencia ou volta a ouvir uma conversa
    window.addEventListener("messenger:silenciada", (e: any) => {
        const { conversa_id, silenciada } = e.detail || {};
        const info = conversas.get(Number(conversa_id));
        if (info) info.silenciada = !!silenciada;
    });

    // ao abrir o app e ao voltar para ele depois de 1 minuto fora
    setTimeout(alertaNaoLidas, 2500);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") escondidoDesde = Date.now();
        else if (escondidoDesde && Date.now() - escondidoDesde > 60000) setTimeout(alertaNaoLidas, 800);
    });
}
