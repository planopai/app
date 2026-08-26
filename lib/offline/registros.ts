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

export async function saveRegistrosSnapshot<T extends Record<string, any>>(
  registros: T[],
  userId?: string | null,
): Promise<void> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({ refreshIfOnline: false });
  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();
  if (!resolvedUserId) return;

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

  await replaceRecordsForUser(resolvedUserId, rows);
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
