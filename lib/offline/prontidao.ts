"use client";

/**
 * lib/offline/prontidao.ts (16/11/2026)
 *
 * Responde "este aparelho está pronto para trabalhar sem internet?" e lista o que
 * está esperando envio. Usado pelo painel components/offline/ProntidaoOffline.tsx.
 *
 * Só lê (IndexedDB, Cache Storage, localStorage). Nada aqui envia ou apaga dados.
 */

import { getActionsForUser, type OfflineAction } from "./actions";
import { getMeta } from "./db";
import { chaveMetaSnapshot, loadCachedRegistros } from "./registros";
import { ROTAS_ESSENCIAIS_OFFLINE } from "./routes";
import { browserSaysOnline, getCurrentOfflineSession } from "./session";
import { getSignaturesForUser, type OfflineSignature } from "./signatures";
import { ESPACO_MINIMO_BYTES, formatarBytes, lerArmazenamento, type EstadoArmazenamento } from "./storage";
import { META_ULTIMA_SINCRONIZACAO } from "./sync-engine";

export type NivelProntidao = "ok" | "aviso" | "erro";

export type ItemProntidao = {
  id: "usuario" | "telas" | "dados" | "fila" | "espaco";
  nivel: NivelProntidao;
  titulo: string;
  detalhe: string;
};

export type Pendencia = {
  chave: string;
  tipo: "etapa" | "assinatura" | "cadastro";
  titulo: string;
  falecido: string;
  situacao: "aguardando" | "enviando" | "atencao" | "login";
  erro?: string;
  quando: string | null;
  /** Só etapas recusadas pelo servidor podem ser dispensadas. */
  acao?: OfflineAction;
};

export type Prontidao = {
  nivel: NivelProntidao;
  online: boolean;
  usuario: string | null;
  ultimaSincronizacao: number | null;
  itens: ItemProntidao[];
  pendencias: Pendencia[];
  aguardando: number;
  atencao: number;
  armazenamento: EstadoArmazenamento | null;
  avaliadoEm: number;
};

/** Lista de atendimentos guardada há mais que isso: pedir para atualizar antes de sair. */
const DADOS_VELHOS_MS = 60 * 60 * 1000;

/** Fila antiga de cadastros offline, mantida em app/acompanhamento/page.tsx (OFFLINE_QUEUE_KEY). */
const FILA_CADASTROS_KEY = "acomp_offline_queue_v1";

function lerFilaCadastros(userId: string): Array<{ qid: string; createdAt: number; lastError?: string; payload?: any; userId?: string }> {
  try {
    const raw = window.localStorage.getItem(FILA_CADASTROS_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(lista)) return [];
    return lista.filter((it) => it && (!it.userId || String(it.userId) === String(userId)));
  } catch {
    return [];
  }
}

function pior(a: NivelProntidao, b: NivelProntidao): NivelProntidao {
  const peso = { ok: 0, aviso: 1, erro: 2 } as const;
  return peso[a] >= peso[b] ? a : b;
}

function haQuanto(ms: number): string {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export { haQuanto };

/**
 * Confere se a tela guardada abre sem internet: precisa estar no cache E os
 * arquivos de script que ela pede precisam estar guardados (senão é cópia de
 * uma versão antiga e abre em branco).
 */
async function conferirTela(rota: string): Promise<"ok" | "ausente" | "antiga"> {
  if (typeof caches === "undefined") return "ausente";
  const resp = await caches.match(rota, { ignoreSearch: true }).catch(() => undefined);
  if (!resp) return "ausente";

  let html = "";
  try {
    html = await resp.clone().text();
  } catch {
    return "ok";
  }

  const scripts = Array.from(
    new Set(html.match(/\/_next\/static\/[^"'\s)\\]+\.js/g) ?? []),
  );
  for (const src of scripts) {
    const achou = await caches.match(src, { ignoreSearch: true }).catch(() => undefined);
    if (!achou) return "antiga";
  }
  return "ok";
}

function nomeFalecido(registro: any): string {
  return String(
    registro?.falecido ?? registro?.nome_falecido ?? registro?.falecido_nome ?? "",
  ).trim();
}

function situacaoDe(status: string): Pendencia["situacao"] | null {
  if (status === "pending") return "aguardando";
  if (status === "sending") return "enviando";
  if (status === "requires_attention") return "atencao";
  if (status === "blocked_auth") return "login";
  return null;
}

export async function avaliarProntidao(): Promise<Prontidao> {
  const online = browserSaysOnline();
  const itens: ItemProntidao[] = [];
  const pendencias: Pendencia[] = [];

  const base: Prontidao = {
    nivel: "erro",
    online,
    usuario: null,
    ultimaSincronizacao: null,
    itens,
    pendencias,
    aguardando: 0,
    atencao: 0,
    armazenamento: null,
    avaliadoEm: Date.now(),
  };

  // 1) Usuário guardado no aparelho
  const sessao = await getCurrentOfflineSession({ refreshIfOnline: false }).catch(() => null);
  if (!sessao) {
    itens.push({
      id: "usuario",
      nivel: "erro",
      titulo: "Usuário não guardado no aparelho",
      detalhe: "Abra o PAI com internet e entre com o seu login antes de sair.",
    });
    return base;
  }
  base.usuario = sessao.userName || null;
  itens.push({ id: "usuario", nivel: "ok", titulo: "Usuário guardado", detalhe: sessao.userName || sessao.login || "" });

  // 2) Telas essenciais (Service Worker + cópia da versão atual)
  const temSW = typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
  if (!temSW) {
    itens.push({
      id: "telas",
      nivel: "erro",
      titulo: "Modo offline ainda não ativado neste aparelho",
      detalhe: "Feche e abra o PAI de novo com internet. Se continuar, use o app instalado na tela inicial.",
    });
  } else {
    const resultados = await Promise.all(ROTAS_ESSENCIAIS_OFFLINE.map((r) => conferirTela(r)));
    if (resultados.every((r) => r === "ok")) {
      itens.push({ id: "telas", nivel: "ok", titulo: "Telas guardadas", detalhe: "Início e Atendimentos abrem sem internet." });
    } else if (resultados.includes("antiga")) {
      itens.push({
        id: "telas",
        nivel: "erro",
        titulo: "Telas guardadas são de uma versão antiga",
        detalhe: "Abra o PAI com internet e aguarde alguns segundos para atualizar.",
      });
    } else {
      itens.push({
        id: "telas",
        nivel: "erro",
        titulo: "Telas ainda não guardadas",
        detalhe: "Com internet, abra o Início e Atendimentos uma vez e aguarde alguns segundos.",
      });
    }
  }

  // 3) Lista de atendimentos guardada
  const snapshotEm = (await getMeta<number>(chaveMetaSnapshot(sessao.userId)).catch(() => undefined)) ?? null;
  let registros: any[] = [];
  try {
    registros = await loadCachedRegistros<any>(sessao.userId);
  } catch {
    registros = [];
  }
  const guardadoEm =
    snapshotEm ??
    (registros.length ? Math.max(...registros.map((r) => Number(r?.__cachedAt ?? 0) || 0)) : null);

  if (!guardadoEm) {
    itens.push({
      id: "dados",
      nivel: "erro",
      titulo: "Lista de atendimentos não guardada",
      detalhe: "Com internet, abra a tela de Atendimentos e aguarde a lista carregar.",
    });
  } else if (Date.now() - guardadoEm > DADOS_VELHOS_MS) {
    itens.push({
      id: "dados",
      nivel: "aviso",
      titulo: "Lista de atendimentos desatualizada",
      detalhe: `Atualizada ${haQuanto(guardadoEm)}. ${online ? "Ela atualiza sozinha nesta tela em instantes." : "Atualize com internet antes de sair."}`,
    });
  } else {
    itens.push({
      id: "dados",
      nivel: "ok",
      titulo: "Lista de atendimentos guardada",
      detalhe: `${registros.length} atendimento${registros.length === 1 ? "" : "s"}, atualizada ${haQuanto(guardadoEm)}.`,
    });
  }

  // 4) Fila (etapas, assinaturas e cadastros feitos sem internet)
  const porId = new Map<string, any>();
  for (const r of registros) porId.set(String(r?.id ?? r?.sepultamento_id ?? ""), r);

  let acoes: OfflineAction[] = [];
  try {
    acoes = await getActionsForUser(sessao.userId, ["pending", "sending", "blocked_auth", "requires_attention"]);
  } catch {
    acoes = [];
  }
  for (const a of acoes) {
    const situacao = situacaoDe(a.status);
    if (!situacao) continue;
    pendencias.push({
      chave: `acao:${a.operationId}`,
      tipo: "etapa",
      titulo: a.label,
      falecido: nomeFalecido(porId.get(String(a.recordId))),
      situacao,
      erro: a.lastError,
      quando: a.occurredAt || null,
      acao: situacao === "atencao" ? a : undefined,
    });
  }

  let assinaturas: OfflineSignature[] = [];
  try {
    assinaturas = await getSignaturesForUser(sessao.userId, ["pending", "sending", "blocked_auth", "requires_attention"]);
  } catch {
    assinaturas = [];
  }
  for (const s of assinaturas) {
    const situacao = situacaoDe(String(s.status));
    if (!situacao) continue;
    pendencias.push({
      chave: `assinatura:${s.signatureId}`,
      tipo: "assinatura",
      titulo: s.kind === "recebimento" ? "Assinatura de recebimento" : "Assinatura da requisição",
      falecido: nomeFalecido(porId.get(String(s.recordId))),
      situacao,
      erro: (s as any).lastError,
      quando: s.occurredAt || null,
    });
  }

  for (const it of lerFilaCadastros(sessao.userId)) {
    pendencias.push({
      chave: `cadastro:${it.qid}`,
      tipo: "cadastro",
      titulo: "Cadastro do atendimento",
      falecido: nomeFalecido(it.payload),
      situacao: "aguardando",
      erro: it.lastError,
      quando: it.createdAt ? new Date(it.createdAt).toISOString() : null,
    });
  }

  pendencias.sort((a, b) => String(a.quando ?? "").localeCompare(String(b.quando ?? "")));
  base.aguardando = pendencias.filter((p) => p.situacao === "aguardando" || p.situacao === "enviando").length;
  base.atencao = pendencias.filter((p) => p.situacao === "atencao").length;
  const precisaLogin = pendencias.some((p) => p.situacao === "login");

  if (precisaLogin) {
    itens.push({
      id: "fila",
      nivel: "erro",
      titulo: "Login vencido: a fila não está sendo enviada",
      detalhe: "Saia e entre de novo no PAI com internet para enviar o que está guardado.",
    });
  } else if (base.atencao > 0) {
    itens.push({
      id: "fila",
      nivel: "aviso",
      titulo: `${base.atencao} registro${base.atencao > 1 ? "s" : ""} recusado${base.atencao > 1 ? "s" : ""} pelo servidor`,
      detalhe: "Veja o motivo abaixo e confira o atendimento com a gestão.",
    });
  } else if (base.aguardando > 0) {
    itens.push({
      id: "fila",
      nivel: online ? "aviso" : "ok",
      titulo: `${base.aguardando} registro${base.aguardando > 1 ? "s" : ""} aguardando envio`,
      detalhe: online
        ? "Com internet, o envio acontece em instantes. Se não sair, toque em Sincronizar agora."
        : "Vão ser enviados sozinhos quando a internet voltar.",
    });
  } else {
    itens.push({ id: "fila", nivel: "ok", titulo: "Nada aguardando envio", detalhe: "" });
  }

  // 5) Espaço no aparelho
  const arm = await lerArmazenamento();
  base.armazenamento = arm;
  if (arm.livreBytes != null && arm.livreBytes < ESPACO_MINIMO_BYTES) {
    itens.push({
      id: "espaco",
      nivel: "aviso",
      titulo: "Pouco espaço para o PAI no aparelho",
      detalhe: `Livre: ${formatarBytes(arm.livreBytes)}. Libere espaço para garantir as fotos da Entrega de Corpo.`,
    });
  } else {
    itens.push({
      id: "espaco",
      nivel: "ok",
      titulo: arm.persistente ? "Dados protegidos no aparelho" : "Espaço no aparelho",
      detalhe: arm.persistente
        ? "O navegador não apaga a fila sozinho."
        : arm.livreBytes != null
          ? `Livre para o PAI: ${formatarBytes(arm.livreBytes)}.`
          : "",
    });
  }

  // Última sincronização
  const ultima = await getMeta<{ em: number; userId: string }>(META_ULTIMA_SINCRONIZACAO).catch(() => undefined);
  if (ultima && String(ultima.userId) === String(sessao.userId)) base.ultimaSincronizacao = ultima.em;

  base.nivel = itens.reduce<NivelProntidao>((n, it) => pior(n, it.nivel), "ok");
  return base;
}
