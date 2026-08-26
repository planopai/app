"use client";

import { OFFLINE_STORES, idbDelete, idbGet, idbPut, newOfflineId } from "./db";
import { getOfflineDeviceId } from "./device";
import { getOperationalTimestamp } from "./clock";
import { getCurrentOfflineSession } from "./session";

export type OfflineMaterialCheckItem = {
  key: string;
  nome: string;
  qtd: number;
  ok: number;
  nao_conforme: number;
};

export type OfflineMaterialCheck = {
  checkId: string;
  operationId: string;
  userId: string;
  userName: string;
  recordId: string;
  falecidoNome: string;
  observacao: string;
  itens: OfflineMaterialCheckItem[];
  occurredAt: string;
  deviceOccurredAt: string;
  clockOffsetMs: number;
  deviceId: string;
  createdAt: number;
};

export async function saveOfflineMaterialCheck(input: {
  recordId: string | number;
  falecidoNome: string;
  observacao: string;
  itens: OfflineMaterialCheckItem[];
}): Promise<OfflineMaterialCheck> {
  const session = await getCurrentOfflineSession({ refreshIfOnline: false });
  if (!session) throw new Error("Usuário offline não identificado.");

  const timestamp = await getOperationalTimestamp();
  const deviceId = await getOfflineDeviceId();
  const row: OfflineMaterialCheck = {
    checkId: newOfflineId("mat-check"),
    operationId: newOfflineId("mat-op"),
    userId: session.userId,
    userName: session.userName,
    recordId: String(input.recordId),
    falecidoNome: input.falecidoNome,
    observacao: input.observacao,
    itens: input.itens,
    occurredAt: timestamp.occurredAt,
    deviceOccurredAt: timestamp.deviceOccurredAt,
    clockOffsetMs: timestamp.clockOffsetMs,
    deviceId,
    createdAt: Date.now(),
  };

  await idbPut(OFFLINE_STORES.materialChecks, row);
  return row;
}

export async function getOfflineMaterialCheck(checkId: string): Promise<OfflineMaterialCheck | null> {
  return (await idbGet<OfflineMaterialCheck>(OFFLINE_STORES.materialChecks, checkId)) ?? null;
}

export async function deleteOfflineMaterialCheck(checkId: string): Promise<void> {
  await idbDelete(OFFLINE_STORES.materialChecks, checkId);
}
