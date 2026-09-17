"use client";

import {
  OFFLINE_STORES,
  idbGet,
  idbGetAllByIndex,
  idbPut,
  replaceRecordsForUser,
} from "./db";
import { getCurrentOfflineSession } from "./session";

export type CachedRegistroRow<T = any> = {
  pk: string;
  userId: string;
  recordId: string;
  data: T;
  updatedAt: number;
  fetchedAt: number;
};

function recordIdOf(record: any): string {
  return String(record?.id ?? record?.sepultamento_id ?? "").trim();
}

/*
 * Serializa as gravações de snapshot por usuário.
 *
 * Se duas atualizações forem agendadas muito próximas, a mais antiga não pode
 * terminar depois e deixar o IndexedDB em uma versão anterior à última resposta
 * recebida do servidor.
 */
const snapshotGenerationByUser = new Map<string, number>();
const snapshotWriteTailByUser = new Map<string, Promise<void>>();

export async function saveRegistrosSnapshot<T extends Record<string, any>>(
  registros: T[],
  userId?: string | null,
): Promise<void> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({ refreshIfOnline: false });
  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();
  if (!resolvedUserId) return;

  const generation =
    (snapshotGenerationByUser.get(resolvedUserId) ?? 0) + 1;
  snapshotGenerationByUser.set(resolvedUserId, generation);

  const now = Date.now();
  const rows: CachedRegistroRow<T>[] = [];
  for (const registro of registros ?? []) {
    const recordId = recordIdOf(registro);
    if (!recordId) continue;
    rows.push({
      pk: `${resolvedUserId}:${recordId}`,
      userId: resolvedUserId,
      recordId,
      data: registro,
      updatedAt: now,
      fetchedAt: now,
    });
  }

  const previous =
    snapshotWriteTailByUser.get(resolvedUserId) ?? Promise.resolve();

  const current = previous
    .catch(() => undefined)
    .then(async () => {
      /*
       * Se uma versão mais nova foi agendada antes desta gravação começar,
       * esta já perdeu autoridade e não precisa tocar no IndexedDB.
       */
      if (snapshotGenerationByUser.get(resolvedUserId) !== generation) {
        return;
      }

      await replaceRecordsForUser(resolvedUserId, rows);
    });

  snapshotWriteTailByUser.set(resolvedUserId, current);

  try {
    await current;
  } finally {
    if (snapshotWriteTailByUser.get(resolvedUserId) === current) {
      snapshotWriteTailByUser.delete(resolvedUserId);
    }
  }
}

export async function loadCachedRegistros<T = any>(
  userId?: string | null,
): Promise<T[]> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({ refreshIfOnline: false });
  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();
  if (!resolvedUserId) return [];

  const rows = await idbGetAllByIndex<CachedRegistroRow<T>>(
    OFFLINE_STORES.records,
    "userId",
    IDBKeyRange.only(resolvedUserId),
  );

  rows.sort((a, b) => {
    const ai = Number((a.data as any)?.id ?? 0) || 0;
    const bi = Number((b.data as any)?.id ?? 0) || 0;
    return bi - ai;
  });

  return rows.map((row) => ({
    ...(row.data as any),
    __cachedAt: row.fetchedAt,
  })) as T[];
}

export async function getCachedRegistro<T = any>(
  recordId: string | number,
  userId?: string | null,
): Promise<T | null> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({ refreshIfOnline: false });
  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();
  if (!resolvedUserId) return null;

  const key = `${resolvedUserId}:${String(recordId)}`;
  const row = await idbGet<CachedRegistroRow<T>>(OFFLINE_STORES.records, key);
  return row?.data ?? null;
}

export async function patchCachedRegistro<T extends Record<string, any>>(
  recordId: string | number,
  patch: Partial<T> & Record<string, any>,
  userId?: string | null,
): Promise<T | null> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({ refreshIfOnline: false });
  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();
  if (!resolvedUserId) return null;

  const key = `${resolvedUserId}:${String(recordId)}`;
  const current = await idbGet<CachedRegistroRow<T>>(OFFLINE_STORES.records, key);
  if (!current) return null;

  const nextData = {
    ...(current.data as any),
    ...patch,
  } as T;

  await idbPut(OFFLINE_STORES.records, {
    ...current,
    data: nextData,
    updatedAt: Date.now(),
  });

  return nextData;
}
