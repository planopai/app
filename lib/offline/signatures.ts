"use client";

import {
  OFFLINE_STORES,
  idbDelete,
  idbGet,
  idbGetAllByIndex,
  idbPut,
  newOfflineId,
} from "./db";
import { getOperationalTimestamp } from "./clock";
import { getOfflineDeviceId } from "./device";
import { patchCachedRegistro } from "./registros";
import { getCurrentOfflineSession } from "./session";

export type OfflineSignatureKind = "recebimento" | "requisicao";

export type OfflineSignatureStatus =
  | "pending"
  | "sending"
  | "synced"
  | "requires_attention"
  | "blocked_auth";

export type OfflineSignature = {
  signatureId: string;
  operationId: string;

  userId: string;
  userName: string;
  recordId: string;

  kind: OfflineSignatureKind;
  name: string;
  cpf: string;

  blob: Blob;
  mimeType: string;
  size: number;

  occurredAt: string;
  deviceOccurredAt: string;
  clockOffsetMs: number;
  timezoneOffsetMinutes: number;
  deviceId: string;

  status: OfflineSignatureStatus;
  tries: number;
  lastError?: string;

  createdAt: number;
  updatedAt: number;
  syncedAt?: string;
  serverUrl?: string;
};

function onlyCpfDigits(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "").slice(0, 11);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);

  if (!match) {
    throw new Error("Assinatura em formato inválido.");
  }

  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  let bytes: Uint8Array;

  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }

  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Não foi possível ler a assinatura local."));

    reader.readAsDataURL(blob);
  });
}

async function currentSessionOrThrow() {
  const session = await getCurrentOfflineSession({
    refreshIfOnline: false,
    allowCachedOnNetworkFailure: true,
  });

  if (!session?.userId) {
    throw new Error(
      "Usuário offline não identificado. Abra o aplicativo com internet ao menos uma vez antes de assinar offline.",
    );
  }

  return session;
}

export async function saveOfflineSignature(input: {
  recordId: string | number;
  kind: OfflineSignatureKind;
  name: string;
  cpf: string;
  blob: Blob;
  operationId?: string;
}): Promise<OfflineSignature> {
  const session = await currentSessionOrThrow();

  const recordId = String(input.recordId ?? "").trim();

  if (!recordId) {
    throw new Error("Atendimento inválido.");
  }

  const name = String(input.name ?? "").trim();

  if (name.length < 3) {
    throw new Error("Informe o nome completo.");
  }

  const cpf = onlyCpfDigits(input.cpf);

  if (cpf.length !== 11) {
    throw new Error("Informe um CPF com 11 dígitos.");
  }

  if (!(input.blob instanceof Blob) || input.blob.size <= 0) {
    throw new Error("Assinatura vazia.");
  }

  const stamp = await getOperationalTimestamp();
  const deviceId = await getOfflineDeviceId();
  const operationId = input.operationId || newOfflineId("signature");
  const signatureId = newOfflineId("signature-row");

  const previous = await idbGetAllByIndex<OfflineSignature>(
    OFFLINE_STORES.signatures,
    "userRecordKind",
    IDBKeyRange.only([session.userId, recordId, input.kind]),
  );

  for (const row of previous) {
    await idbDelete(OFFLINE_STORES.signatures, row.signatureId);
  }

  const now = Date.now();

  const row: OfflineSignature = {
    signatureId,
    operationId,
    userId: session.userId,
    userName: session.userName,
    recordId,
    kind: input.kind,
    name,
    cpf,
    blob: input.blob,
    mimeType: input.blob.type || "image/png",
    size: input.blob.size,
    occurredAt: stamp.occurredAt,
    deviceOccurredAt: stamp.deviceOccurredAt,
    clockOffsetMs: stamp.clockOffsetMs,
    timezoneOffsetMinutes: stamp.timezoneOffsetMinutes,
    deviceId,
    status: "pending",
    tries: 0,
    createdAt: now,
    updatedAt: now,
  };

  await idbPut(OFFLINE_STORES.signatures, row);

  const patch =
    input.kind === "recebimento"
      ? {
          assinatura_responsavel_nome: name,
          assinatura_responsavel_cpf: cpf,
          __assinaturaRecebimentoStatus: "pending",
        }
      : {
          assinatura_requerente_nome: name,
          assinatura_requerente_cpf: cpf,
          __assinaturaRequisicaoStatus: "pending",
        };

  await patchCachedRegistro(recordId, patch, session.userId);

  return row;
}

export async function getOfflineSignature(
  signatureId: string,
): Promise<OfflineSignature | null> {
  const row = await idbGet<OfflineSignature>(
    OFFLINE_STORES.signatures,
    signatureId,
  );

  return row ?? null;
}

export async function getLatestOfflineSignature(
  recordId: string | number,
  kind: OfflineSignatureKind,
  userId?: string | null,
): Promise<OfflineSignature | null> {
  const session = userId
    ? null
    : await getCurrentOfflineSession({
        refreshIfOnline: false,
        allowCachedOnNetworkFailure: true,
      });

  const resolvedUserId = String(userId ?? session?.userId ?? "").trim();

  if (!resolvedUserId) {
    return null;
  }

  const rows = await idbGetAllByIndex<OfflineSignature>(
    OFFLINE_STORES.signatures,
    "userRecordKind",
    IDBKeyRange.only([resolvedUserId, String(recordId), kind]),
  );

  if (!rows.length) {
    return null;
  }

  rows.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));

  return rows[0] ?? null;
}

export async function getSignaturesForUser(
  userId: string,
  statuses?: OfflineSignatureStatus[],
): Promise<OfflineSignature[]> {
  const rows = await idbGetAllByIndex<OfflineSignature>(
    OFFLINE_STORES.signatures,
    "userId",
    String(userId),
  );

  const filtered = statuses?.length
    ? rows.filter((row) => statuses.includes(row.status))
    : rows;

  return filtered.sort(
    (a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0),
  );
}

export async function updateOfflineSignature(
  signature: OfflineSignature,
  patch: Partial<OfflineSignature>,
): Promise<OfflineSignature> {
  const next: OfflineSignature = {
    ...signature,
    ...patch,
    updatedAt: Date.now(),
  };

  await idbPut(OFFLINE_STORES.signatures, next);

  return next;
}
