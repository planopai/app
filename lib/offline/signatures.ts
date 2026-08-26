"use client";

import {
  OFFLINE_STORES,
  idbGet,
  idbGetAllByIndex,
  idbPut,
  newOfflineId,
} from "./db";
import { getOperationalTimestamp } from "./clock";
import { requestOperationalBackgroundSync } from "./background-sync";
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

  /**
   * Formato atual, usado para evitar problemas do Safari/iOS
   * ao regravar Blob dentro do IndexedDB.
   */
  dataUrl?: string;

  /**
   * Compatibilidade com registros criados pelas versões anteriores.
   * Novas assinaturas não gravam Blob no IndexedDB.
   */
  blob?: Blob;

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
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function validateSignatureDataUrl(dataUrl: string): string {
  const value = String(dataUrl || "").trim();

  if (!/^data:image\/png;base64,/i.test(value)) {
    throw new Error("Assinatura em formato inválido.");
  }

  return value;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");

  if (comma < 0) {
    return dataUrl.length;
  }

  const payload = dataUrl.slice(comma + 1);
  const padding =
    payload.endsWith("==") ? 2 :
      payload.endsWith("=") ? 1 :
        0;

  return Math.max(
    0,
    Math.floor((payload.length * 3) / 4) - padding,
  );
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]*)$/,
  );

  if (!match) {
    throw new Error("Assinatura em formato inválido.");
  }

  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob(
      [bytesToArrayBuffer(bytes)],
      { type: mime },
    );
  }

  const decoded = decodeURIComponent(payload);
  const encoded = new TextEncoder().encode(decoded);

  return new Blob(
    [bytesToArrayBuffer(encoded)],
    { type: mime },
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ""));
    };

    reader.onerror = () => {
      reject(
        reader.error ??
        new Error(
          "Não foi possível ler a assinatura local.",
        ),
      );
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Lê tanto o formato novo (dataUrl) quanto o formato legado (Blob).
 */
export async function signatureToDataUrl(
  signature: Pick<OfflineSignature, "dataUrl" | "blob">,
): Promise<string> {
  const direct = String(signature.dataUrl || "").trim();

  if (direct) {
    return direct;
  }

  if (signature.blob instanceof Blob) {
    return blobToDataUrl(signature.blob);
  }

  throw new Error(
    "Imagem da assinatura não está disponível no armazenamento local.",
  );
}

/**
 * Antes de qualquer regravação de status, converte uma linha antiga
 * com Blob para o novo formato string. Assim o Safari não precisa
 * reescrever Blob repetidamente no IndexedDB.
 */
async function normalizeForStorage(
  signature: OfflineSignature,
): Promise<OfflineSignature> {
  let dataUrl = String(signature.dataUrl || "").trim();

  if (!dataUrl && signature.blob instanceof Blob) {
    dataUrl = await blobToDataUrl(signature.blob);
  }

  const normalized: OfflineSignature = {
    ...signature,
    dataUrl: dataUrl || undefined,
  };

  delete (normalized as any).blob;

  return normalized;
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

  /**
   * Preferido. O SignatureModal envia diretamente o PNG como dataURL.
   */
  dataUrl?: string;

  /**
   * Compatibilidade caso algum outro ponto antigo ainda envie Blob.
   */
  blob?: Blob;

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

  let dataUrl = String(input.dataUrl || "").trim();

  if (!dataUrl && input.blob instanceof Blob) {
    dataUrl = await blobToDataUrl(input.blob);
  }

  dataUrl = validateSignatureDataUrl(dataUrl);

  const stamp = await getOperationalTimestamp();
  const deviceId = await getOfflineDeviceId();

  const operationId =
    input.operationId ||
    newOfflineId("signature");

  /*
   * Chave determinística:
   * sempre existe uma única linha atual por usuário + atendimento + tipo.
   *
   * Não precisamos apagar, consultar ou recriar a linha anterior.
   * Um único put() substitui a assinatura de forma atômica.
   */
  const signatureId = [
    "signature-row",
    session.userId,
    recordId,
    input.kind,
  ].join(":");

  const previous =
    await idbGet<OfflineSignature>(
      OFFLINE_STORES.signatures,
      signatureId,
    );

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
    dataUrl,
    mimeType: "image/png",
    size: estimateDataUrlBytes(dataUrl),
    occurredAt: stamp.occurredAt,
    deviceOccurredAt: stamp.deviceOccurredAt,
    clockOffsetMs: stamp.clockOffsetMs,
    timezoneOffsetMinutes: stamp.timezoneOffsetMinutes,
    deviceId,
    status: "pending",
    tries: 0,
    createdAt:
      previous?.createdAt ?? now,
    updatedAt: now,
  };

  /*
   * Esta é a única gravação crítica da assinatura.
   * A linha contém apenas strings/números, sem Blob.
   */
  await idbPut(
    OFFLINE_STORES.signatures,
    row,
  );

  const patch: Record<string, any> =
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

  /*
   * O snapshot da tabela é auxiliar.
   * Se o Safari falhar ao atualizar esse cache, não consideramos
   * a assinatura perdida, pois ela já está salva na store signatures.
   */
  try {
    await patchCachedRegistro<Record<string, any>>(
      recordId,
      patch,
      session.userId,
    );
  } catch (error) {
    console.warn(
      "[ASSINATURA] Assinatura salva, mas o snapshot local não pôde ser atualizado.",
      error,
    );
  }

  await requestOperationalBackgroundSync();

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

  const resolvedUserId = String(
    userId ?? session?.userId ?? "",
  ).trim();

  if (!resolvedUserId) {
    return null;
  }

  /*
   * Primeiro tenta a chave determinística da versão atual.
   */
  const currentKey = [
    "signature-row",
    resolvedUserId,
    String(recordId),
    kind,
  ].join(":");

  const current =
    await idbGet<OfflineSignature>(
      OFFLINE_STORES.signatures,
      currentKey,
    );

  if (current) {
    return current;
  }

  /*
   * Compatibilidade com linhas antigas que usavam IDs aleatórios.
   */
  const rows =
    await idbGetAllByIndex<OfflineSignature>(
      OFFLINE_STORES.signatures,
      "userRecordKind",
      IDBKeyRange.only([
        resolvedUserId,
        String(recordId),
        kind,
      ]),
    );

  if (!rows.length) {
    return null;
  }

  rows.sort(
    (a, b) =>
      Number(b.updatedAt ?? 0) -
      Number(a.updatedAt ?? 0),
  );

  return rows[0] ?? null;
}

export async function getSignaturesForUser(
  userId: string,
  statuses?: OfflineSignatureStatus[],
): Promise<OfflineSignature[]> {
  const rows =
    await idbGetAllByIndex<OfflineSignature>(
      OFFLINE_STORES.signatures,
      "userId",
      String(userId),
    );

  const filtered = statuses?.length
    ? rows.filter((row) =>
      statuses.includes(row.status),
    )
    : rows;

  /*
   * Pode existir uma linha antiga com signatureId aleatório e uma linha
   * nova determinística para o mesmo atendimento/tipo. Sincronizamos
   * somente a mais recente de cada assinatura lógica.
   */
  const latestByLogicalKey = new Map<string, OfflineSignature>();

  for (const row of filtered) {
    const key = [
      row.userId,
      row.recordId,
      row.kind,
    ].join(":");

    const current = latestByLogicalKey.get(key);

    if (
      !current ||
      Number(row.updatedAt ?? 0) >
      Number(current.updatedAt ?? 0)
    ) {
      latestByLogicalKey.set(key, row);
    }
  }

  return Array.from(latestByLogicalKey.values()).sort(
    (a, b) =>
      Number(a.createdAt ?? 0) -
      Number(b.createdAt ?? 0),
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

  const normalized =
    await normalizeForStorage(next);

  await idbPut(
    OFFLINE_STORES.signatures,
    normalized,
  );

  return normalized;
}