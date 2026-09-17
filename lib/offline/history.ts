"use client";

import { OFFLINE_STORES, idbDelete, idbGetAllByIndex, idbPut } from "./db";
import { getActionsForUser } from "./actions";
import { browserSaysOnline, getCurrentOfflineSession } from "./session";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

type CachedHistoryRow = {
  pk: string;
  userId: string;
  recordId: string;
  occurredAt: string;
  data: any;
  updatedAt: number;
};

function historyKey(userId: string, recordId: string, item: any, index: number): string {
  const stable = String(item?.operation_id ?? item?.id ?? `${item?.datahora ?? ""}-${index}`);
  return `${userId}:${recordId}:${stable}`;
}

async function saveHistory(userId: string, recordId: string, items: any[]): Promise<void> {
  const uid = String(userId);
  const rid = String(recordId);
  const now = Date.now();
  const nextRows: CachedHistoryRow[] = [];

  let index = 0;
  for (const item of items) {
    const occurredAt = String(item?.datahora ?? item?.ocorreu_em ?? "");
    nextRows.push({
      pk: historyKey(uid, rid, item, index++),
      userId: uid,
      recordId: rid,
      occurredAt,
      data: item,
      updatedAt: now,
    });
  }

  /*
   * A resposta remota representa o histórico canônico daquele atendimento.
   * Removemos do cache entradas que não existem mais na resposta atual.
   * Isso também faz com que uma resposta válida [] limpe histórico antigo,
   * impedindo que ele reapareça na próxima abertura offline.
   */
  const previousRows = await idbGetAllByIndex<CachedHistoryRow>(
    OFFLINE_STORES.history,
    "userRecord",
    IDBKeyRange.only([uid, rid]),
  );
  const nextKeys = new Set(nextRows.map((row) => row.pk));

  for (const previous of previousRows) {
    if (!nextKeys.has(previous.pk)) {
      await idbDelete(OFFLINE_STORES.history, previous.pk);
    }
  }

  for (const row of nextRows) {
    await idbPut(OFFLINE_STORES.history, row);
  }
}

export async function loadCachedHistory(recordId: string | number, userId: string): Promise<any[]> {
  const rows = await idbGetAllByIndex<CachedHistoryRow>(
    OFFLINE_STORES.history,
    "userRecord",
    IDBKeyRange.only([String(userId), String(recordId)]),
  );

  rows.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  return rows.map((row) => row.data);
}

function pendingActionAsLog(action: any): any {
  return {
    id: `local:${action.operationId}`,
    operation_id: action.operationId,
    sepultamento_id: action.recordId,
    usuario: action.userName,
    usuario_id: action.userId,
    acao: "atualizou status",
    acao_humana: action.label,
    status_anterior: action.statusAnterior,
    status_novo: action.statusNovo,
    detalhes: JSON.stringify({
      origem: "offline",
      status_sync: action.status,
    }),
    detalhes_array: {
      origem: "offline",
      status_sync: action.status,
    },
    datahora: action.occurredAt,
    data_hora: action.occurredAt,
    origem: "offline",
    sincronizado_em: null,
    device_id: action.deviceId,
    __localPending: true,
    __syncStatus: action.status,
  };
}

export async function getHistoryOfflineAware(recordId: string | number): Promise<any[]> {
  const session = await getCurrentOfflineSession({
    refreshIfOnline: browserSaysOnline(),
    allowCachedOnNetworkFailure: true,
  });
  if (!session) return [];

  let remote: any[] = [];
  let remoteLoaded = false;

  if (browserSaysOnline()) {
    try {
      const response = await fetch(
        `${ENDPOINT}/historico_sepultamentos.php?log=1&id=${encodeURIComponent(String(recordId))}&_=${Date.now()}`,
        {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );

      if (response.ok) {
        const json = await response.json().catch(() => null);

        if (Array.isArray(json)) {
          remote = json;
          remoteLoaded = true;
        } else if (json?.sucesso && Array.isArray(json.dados)) {
          remote = json.dados;
          remoteLoaded = true;
        }

        if (remoteLoaded) {
          await saveHistory(session.userId, String(recordId), remote);
        }
      }
    } catch {
      // Falha real de rede/armazenamento: usa o último histórico local abaixo.
    }
  }

  /*
   * Uma resposta remota válida e vazia continua sendo autoritativa.
   * Antes, remote.length === 0 fazia o código ressuscitar histórico antigo
   * do IndexedDB mesmo quando o servidor tinha respondido corretamente [].
   */
  const base = remoteLoaded
    ? remote
    : await loadCachedHistory(recordId, session.userId);

  const actions = await getActionsForUser(session.userId, [
    "pending",
    "sending",
    "requires_attention",
    "blocked_auth",
  ]);
  const local = actions
    .filter((action) => String(action.recordId) === String(recordId))
    .map(pendingActionAsLog);

  const knownOperationIds = new Set(
    base.map((item) => String(item?.operation_id ?? "")).filter(Boolean),
  );

  return [...base, ...local.filter((item) => !knownOperationIds.has(String(item.operation_id)))]
    .sort((a, b) => {
      const at = Date.parse(String(a?.datahora ?? "")) || 0;
      const bt = Date.parse(String(b?.datahora ?? "")) || 0;
      return at - bt;
    });
}
