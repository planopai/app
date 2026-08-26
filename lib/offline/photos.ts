"use client";

import {
  OFFLINE_STORES,
  idbDelete,
  idbGet,
  idbPut,
  newOfflineId,
} from "./db";
import { getOfflineDeviceId } from "./device";
import { getOperationalTimestamp } from "./clock";
import { getCurrentOfflineSession } from "./session";

export type OfflinePhotoKind = "entrega_corpo" | "fim_ornamentacao";

export type OfflinePhoto = {
  photoId: string;
  operationId: string;
  userId: string;
  userName: string;
  recordId: string;
  kind: OfflinePhotoKind;
  blob: Blob;
  mimeType: string;
  size: number;
  capturedAt: string;
  deviceCapturedAt: string;
  clockOffsetMs: number;
  deviceId: string;
  createdAt: number;
};

export async function saveOfflinePhoto(input: {
  recordId: string | number;
  kind: OfflinePhotoKind;
  blob: Blob;
  operationId?: string;
  capturedAt?: string;
}): Promise<OfflinePhoto> {
  const session = await getCurrentOfflineSession({ refreshIfOnline: false });
  if (!session) throw new Error("Usuário offline não identificado. Abra o PAI online antes de usar ações offline.");

  const timestamp = await getOperationalTimestamp();
  const deviceId = await getOfflineDeviceId();
  const photo: OfflinePhoto = {
    photoId: newOfflineId("photo"),
    operationId: input.operationId ?? newOfflineId("photo-op"),
    userId: session.userId,
    userName: session.userName,
    recordId: String(input.recordId),
    kind: input.kind,
    blob: input.blob,
    mimeType: input.blob.type || "image/jpeg",
    size: input.blob.size,
    capturedAt: input.capturedAt ?? timestamp.occurredAt,
    deviceCapturedAt: timestamp.deviceOccurredAt,
    clockOffsetMs: timestamp.clockOffsetMs,
    deviceId,
    createdAt: Date.now(),
  };

  await idbPut(OFFLINE_STORES.photos, photo);
  return photo;
}

export async function getOfflinePhoto(photoId: string): Promise<OfflinePhoto | null> {
  return (await idbGet<OfflinePhoto>(OFFLINE_STORES.photos, photoId)) ?? null;
}

export async function deleteOfflinePhoto(photoId: string): Promise<void> {
  await idbDelete(OFFLINE_STORES.photos, photoId);
}
