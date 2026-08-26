"use client";

import { OFFLINE_STORES, idbGetAllByIndex, idbPut } from "./db";
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
  let index = 0;
  for (const item of items) {
    const occurredAt = String(item?.datahora ?? item?.ocorreu_em ?? "");
    const row: CachedHistoryRow = {
      pk: historyKey(userId, recordId, item, index++),
      userId,
      recordId,
      occurredAt,
      data: item,
      updatedAt: Date.now(),
    };
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
        remote = Array.isArray(json)
          ? json
          : json?.sucesso && Array.isArray(json.dados)
            ? json.dados
            : [];
        await saveHistory(session.userId, String(recordId), remote);
      }
    } catch {
      // fallback abaixo
    }
  }

  const base = remote.length
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
