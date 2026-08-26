

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
import {
  getCurrentOfflineSession,
  type OfflineSession,
} from "./session";

const ENDPOINT =
  "https://api.planoassistencialintegrado.com.br";

const IOS_SIGNATURES_KEY =
  "pai_ios_signature_queue_v1";

const IOS_SIGNATURE_SESSION_KEY =
  "pai_ios_signature_session_v1";

const IOS_SIGNATURE_DEVICE_KEY =
  "pai_ios_signature_device_v1";

export type OfflineSignatureKind =
  | "recebimento"
  | "requisicao";

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

  dataUrl?: string;
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

  storage?:
  | "indexedDB"
  | "ios-localStorage";
};

function onlyCpfDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function isIOSWebKit(): boolean {
  if (
    typeof navigator === "undefined"
  ) {
    return false;
  }

  const ua =
    navigator.userAgent || "";

  const classicIOS =
    /iPad|iPhone|iPod/i.test(ua);

  const iPadDesktopMode =
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1;

  return classicIOS || iPadDesktopMode;
}

function safeLocalStorage():
  Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readIOSSignatures():
  OfflineSignature[] {
  const storage = safeLocalStorage();

  if (!storage) {
    return [];
  }

  try {
    const raw =
      storage.getItem(
        IOS_SIGNATURES_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as OfflineSignature[];
  } catch {
    return [];
  }
}

function writeIOSSignatures(
  rows: OfflineSignature[],
): void {
  const storage = safeLocalStorage();

  if (!storage) {
    throw new Error(
      "Armazenamento local indisponível no iPhone.",
    );
  }

  const normalized = rows.map(
    (row) => {
      const next = {
        ...row,
        storage:
          "ios-localStorage" as const,
      };

      delete (next as any).blob;

      return next;
    },
  );

  try {
    storage.setItem(
      IOS_SIGNATURES_KEY,
      JSON.stringify(normalized),
    );

    return;
  } catch {
    /*
     * Se houver pressão de espaço, removemos somente
     * assinaturas já sincronizadas mais antigas.
     */
    const pending =
      normalized.filter(
        (row) =>
          row.status !== "synced",
      );

    const synced =
      normalized
        .filter(
          (row) =>
            row.status === "synced",
        )
        .sort(
          (a, b) =>
            Number(b.updatedAt ?? 0) -
            Number(a.updatedAt ?? 0),
        )
        .slice(0, 8);

    try {
      storage.setItem(
        IOS_SIGNATURES_KEY,
        JSON.stringify([
          ...pending,
          ...synced,
        ]),
      );

      return;
    } catch {
      throw new Error(
        "Não foi possível salvar a assinatura no armazenamento do iPhone. Libere espaço no aparelho e tente novamente.",
      );
    }
  }
}

function getIOSSignatureById(
  signatureId: string,
): OfflineSignature | null {
  return (
    readIOSSignatures().find(
      (row) =>
        row.signatureId ===
        signatureId,
    ) ?? null
  );
}

function putIOSSignature(
  row: OfflineSignature,
): OfflineSignature {
  const rows =
    readIOSSignatures();

  const next: OfflineSignature = {
    ...row,
    storage:
      "ios-localStorage",
  };

  delete (next as any).blob;

  const index =
    rows.findIndex(
      (item) =>
        item.signatureId ===
        next.signatureId,
    );

  if (index >= 0) {
    rows[index] = next;
  } else {
    rows.push(next);
  }

  writeIOSSignatures(rows);

  return next;
}

function bytesToArrayBuffer(
  bytes: Uint8Array,
): ArrayBuffer {
  const buffer =
    new ArrayBuffer(
      bytes.byteLength,
    );

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function validateSignatureDataUrl(
  dataUrl: string,
): string {
  const value =
    String(dataUrl || "").trim();

  if (
    !/^data:image\/png;base64,/i.test(
      value,
    )
  ) {
    throw new Error(
      "Assinatura em formato inválido.",
    );
  }

  return value;
}

function estimateDataUrlBytes(
  dataUrl: string,
): number {
  const comma =
    dataUrl.indexOf(",");

  if (comma < 0) {
    return dataUrl.length;
  }

  const payload =
    dataUrl.slice(comma + 1);

  const padding =
    payload.endsWith("==")
      ? 2
      : payload.endsWith("=")
        ? 1
        : 0;

  return Math.max(
    0,
    Math.floor(
      (payload.length * 3) / 4,
    ) - padding,
  );
}

export function dataUrlToBlob(
  dataUrl: string,
): Blob {
  const match =
    String(dataUrl || "").match(
      /^data:([^;,]+)?(;base64)?,([\s\S]*)$/,
    );

  if (!match) {
    throw new Error(
      "Assinatura em formato inválido.",
    );
  }

  const mime =
    match[1] || "image/png";

  const isBase64 =
    Boolean(match[2]);

  const payload =
    match[3] || "";

  if (isBase64) {
    const binary =
      atob(payload);

    const bytes =
      new Uint8Array(
        binary.length,
      );

    for (
      let i = 0;
      i < binary.length;
      i += 1
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    return new Blob(
      [bytesToArrayBuffer(bytes)],
      { type: mime },
    );
  }

  const decoded =
    decodeURIComponent(payload);

  const encoded =
    new TextEncoder().encode(
      decoded,
    );

  return new Blob(
    [bytesToArrayBuffer(encoded)],
    { type: mime },
  );
}

export function blobToDataUrl(
  blob: Blob,
): Promise<string> {
  return new Promise<string>(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        resolve(
          String(
            reader.result || "",
          ),
        );
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
    },
  );
}

export async function signatureToDataUrl(
  signature: Pick<
    OfflineSignature,
    "dataUrl" | "blob"
  >,
): Promise<string> {
  const direct =
    String(
      signature.dataUrl || "",
    ).trim();

  if (direct) {
    return direct;
  }

  if (
    signature.blob instanceof Blob
  ) {
    return blobToDataUrl(
      signature.blob,
    );
  }

  throw new Error(
    "Imagem da assinatura não está disponível no armazenamento local.",
  );
}

async function normalizeForStorage(
  signature: OfflineSignature,
): Promise<OfflineSignature> {
  let dataUrl =
    String(
      signature.dataUrl || "",
    ).trim();

  if (
    !dataUrl &&
    signature.blob instanceof Blob
  ) {
    dataUrl =
      await blobToDataUrl(
        signature.blob,
      );
  }

  const normalized:
    OfflineSignature = {
    ...signature,
    dataUrl:
      dataUrl || undefined,
  };

  delete (normalized as any).blob;

  return normalized;
}

function readIOSSession():
  OfflineSession | null {
  const storage =
    safeLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw =
      storage.getItem(
        IOS_SIGNATURE_SESSION_KEY,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed?.userId
    ) {
      return null;
    }

    return parsed as OfflineSession;
  } catch {
    return null;
  }
}

function writeIOSSession(
  session: OfflineSession,
): void {
  const storage =
    safeLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      IOS_SIGNATURE_SESSION_KEY,
      JSON.stringify(session),
    );
  } catch {
    // A assinatura ainda pode ser enviada online.
  }
}

async function refreshIOSSignatureSession():
  Promise<OfflineSession> {
  const startedAt =
    Date.now();

  const response =
    await fetch(
      `${ENDPOINT}/informativo.php?me=1&_=${startedAt}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  const endedAt =
    Date.now();

  const data =
    await response
      .json()
      .catch(() => null);

  if (
    !response.ok ||
    !data ||
    data?.erro ||
    data?.need_login
  ) {
    const error: any =
      new Error(
        String(
          data?.msg ||
          `Falha ao identificar usuário (${response.status}).`,
        ),
      );

    error.status =
      response.status;

    throw error;
  }

  const userId =
    String(
      data.id ?? "",
    ).trim();

  if (
    !userId ||
    userId === "0"
  ) {
    throw new Error(
      "Usuário autenticado sem ID válido.",
    );
  }

  const serverMsRaw =
    Number(
      data.server_time_unix_ms ??
      0,
    );

  const parsedIso =
    data.server_time
      ? Date.parse(
        data.server_time,
      )
      : NaN;

  const serverMs =
    Number.isFinite(
      serverMsRaw,
    ) &&
      serverMsRaw > 0
      ? serverMsRaw
      : Number.isFinite(
        parsedIso,
      )
        ? parsedIso
        : endedAt;

  const midpoint =
    Math.round(
      (startedAt + endedAt) / 2,
    );

  const session:
    OfflineSession = {
    userId,
    userName:
      String(
        data.nome ??
        data.usuario ??
        "",
      ).trim() ||
      `Usuário ${userId}`,
    login:
      String(
        data.usuario ?? "",
      ).trim(),
    cargo:
      String(
        data.cargo ?? "",
      )
        .trim()
        .toLowerCase(),
    depositoInsumos:
      typeof data.deposito_insumos ===
        "string" &&
        data.deposito_insumos.trim()
        ? data.deposito_insumos.trim()
        : null,
    podeConservacao:
      data.pode_conservacao === true ||
      data.pode_conservacao === 1 ||
      data.pode_conservacao === "1" ||
      String(
        data.pode_conservacao ??
        "",
      ).toLowerCase() ===
      "true",
    serverTimeAtSync:
      serverMs,
    deviceTimeAtSync:
      midpoint,
    clockOffsetMs:
      serverMs - midpoint,
    lastSeenAt:
      Date.now(),
  };

  writeIOSSession(session);

  return session;
}

async function currentSessionOrThrow():
  Promise<OfflineSession> {
  if (isIOSWebKit()) {
    if (
      typeof navigator !==
      "undefined" &&
      navigator.onLine !== false
    ) {
      try {
        return await refreshIOSSignatureSession();
      } catch (error: any) {
        if (
          error?.status === 401 ||
          error?.status === 403
        ) {
          throw error;
        }
      }
    }

    const local =
      readIOSSession();

    if (local?.userId) {
      return local;
    }

    /*
     * Compatibilidade:
     * tenta recuperar uma sessão antiga do IndexedDB,
     * mas qualquer falha do Safari é ignorada.
     */
    try {
      const legacy =
        await getCurrentOfflineSession({
          refreshIfOnline: false,
          allowCachedOnNetworkFailure:
            true,
        });

      if (legacy?.userId) {
        writeIOSSession(legacy);
        return legacy;
      }
    } catch {
      // Sem ação.
    }

    throw new Error(
      "Usuário offline não identificado no iPhone. Abra o PAI com internet ao menos uma vez antes de assinar offline.",
    );
  }

  const session =
    await getCurrentOfflineSession({
      refreshIfOnline: false,
      allowCachedOnNetworkFailure:
        true,
    });

  if (!session?.userId) {
    throw new Error(
      "Usuário offline não identificado. Abra o aplicativo com internet ao menos uma vez antes de assinar offline.",
    );
  }

  return session;
}

function iosTimestamp(
  session: OfflineSession,
) {
  const deviceNow =
    Date.now();

  const offset =
    Number(
      session.clockOffsetMs ?? 0,
    ) || 0;

  const adjustedNow =
    deviceNow + offset;

  return {
    occurredAt:
      new Date(
        adjustedNow,
      ).toISOString(),
    deviceOccurredAt:
      new Date(
        deviceNow,
      ).toISOString(),
    clockOffsetMs:
      offset,
    timezoneOffsetMinutes:
      new Date(
        deviceNow,
      ).getTimezoneOffset(),
  };
}

function iosDeviceId():
  string {
  const storage =
    safeLocalStorage();

  if (storage) {
    try {
      const existing =
        storage.getItem(
          IOS_SIGNATURE_DEVICE_KEY,
        );

      if (existing) {
        return existing;
      }
    } catch {
      // Continua.
    }
  }

  const next =
    newOfflineId(
      "pai-ios-device",
    );

  if (storage) {
    try {
      storage.setItem(
        IOS_SIGNATURE_DEVICE_KEY,
        next,
      );
    } catch {
      // O ID desta operação ainda continua válido.
    }
  }

  return next;
}

export async function saveOfflineSignature(
  input: {
    recordId:
    | string
    | number;
    kind:
    OfflineSignatureKind;
    name: string;
    cpf: string;
    dataUrl?: string;
    blob?: Blob;
    operationId?: string;
  },
): Promise<OfflineSignature> {
  const session =
    await currentSessionOrThrow();

  const recordId =
    String(
      input.recordId ?? "",
    ).trim();

  if (!recordId) {
    throw new Error(
      "Atendimento inválido.",
    );
  }

  const name =
    String(
      input.name ?? "",
    ).trim();

  if (name.length < 3) {
    throw new Error(
      "Informe o nome completo.",
    );
  }

  const cpf =
    onlyCpfDigits(input.cpf);

  if (cpf.length !== 11) {
    throw new Error(
      "Informe um CPF com 11 dígitos.",
    );
  }

  let dataUrl =
    String(
      input.dataUrl || "",
    ).trim();

  if (
    !dataUrl &&
    input.blob instanceof Blob
  ) {
    dataUrl =
      await blobToDataUrl(
        input.blob,
      );
  }

  dataUrl =
    validateSignatureDataUrl(
      dataUrl,
    );

  const ios =
    isIOSWebKit();

  const stamp =
    ios
      ? iosTimestamp(session)
      : await getOperationalTimestamp();

  const deviceId =
    ios
      ? iosDeviceId()
      : await getOfflineDeviceId();

  const operationId =
    input.operationId ||
    newOfflineId("signature");

  const signatureId = [
    "signature-row",
    session.userId,
    recordId,
    input.kind,
  ].join(":");

  let previous:
    OfflineSignature | null =
    null;

  if (ios) {
    previous =
      getIOSSignatureById(
        signatureId,
      );
  } else {
    previous =
      (
        await idbGet<OfflineSignature>(
          OFFLINE_STORES.signatures,
          signatureId,
        )
      ) ?? null;
  }

  const now =
    Date.now();

  const row:
    OfflineSignature = {
    signatureId,
    operationId,
    userId:
      session.userId,
    userName:
      session.userName,
    recordId,
    kind:
      input.kind,
    name,
    cpf,
    dataUrl,
    mimeType:
      "image/png",
    size:
      estimateDataUrlBytes(
        dataUrl,
      ),
    occurredAt:
      stamp.occurredAt,
    deviceOccurredAt:
      stamp.deviceOccurredAt,
    clockOffsetMs:
      stamp.clockOffsetMs,
    timezoneOffsetMinutes:
      stamp.timezoneOffsetMinutes,
    deviceId,
    status:
      "pending",
    tries: 0,
    createdAt:
      previous?.createdAt ??
      now,
    updatedAt:
      now,
    storage:
      ios
        ? "ios-localStorage"
        : "indexedDB",
  };

  if (ios) {
    putIOSSignature(row);
  } else {
    await idbPut(
      OFFLINE_STORES.signatures,
      row,
    );
  }

  const patch:
    Record<string, any> =
    input.kind ===
      "recebimento"
      ? {
        assinatura_responsavel_nome:
          name,
        assinatura_responsavel_cpf:
          cpf,
        __assinaturaRecebimentoStatus:
          "pending",
      }
      : {
        assinatura_requerente_nome:
          name,
        assinatura_requerente_cpf:
          cpf,
        __assinaturaRequisicaoStatus:
          "pending",
      };

  try {
    await patchCachedRegistro<
      Record<string, any>
    >(
      recordId,
      patch,
      session.userId,
    );
  } catch (error) {
    console.warn(
      "[ASSINATURA] Assinatura preservada, mas o snapshot IndexedDB não pôde ser atualizado.",
      error,
    );
  }

  await requestOperationalBackgroundSync();

  return row;
}

export async function getOfflineSignature(
  signatureId: string,
): Promise<OfflineSignature | null> {
  if (isIOSWebKit()) {
    const local =
      getIOSSignatureById(
        signatureId,
      );

    if (local) {
      return local;
    }

    try {
      const legacy =
        await idbGet<OfflineSignature>(
          OFFLINE_STORES.signatures,
          signatureId,
        );

      return legacy ?? null;
    } catch {
      return null;
    }
  }

  const row =
    await idbGet<OfflineSignature>(
      OFFLINE_STORES.signatures,
      signatureId,
    );

  return row ?? null;
}

function latestByLogicalKey(
  rows: OfflineSignature[],
): OfflineSignature[] {
  const map =
    new Map<
      string,
      OfflineSignature
    >();

  for (const row of rows) {
    const key = [
      row.userId,
      row.recordId,
      row.kind,
    ].join(":");

    const current =
      map.get(key);

    if (
      !current ||
      Number(
        row.updatedAt ?? 0,
      ) >
      Number(
        current.updatedAt ?? 0,
      )
    ) {
      map.set(key, row);
    }
  }

  return Array.from(
    map.values(),
  );
}

export async function getLatestOfflineSignature(
  recordId:
    | string
    | number,
  kind:
    OfflineSignatureKind,
  userId?:
    | string
    | null,
): Promise<OfflineSignature | null> {
  const session =
    userId
      ? null
      : await currentSessionOrThrow()
        .catch(() => null);

  const resolvedUserId =
    String(
      userId ??
      session?.userId ??
      "",
    ).trim();

  if (!resolvedUserId) {
    return null;
  }

  const currentKey = [
    "signature-row",
    resolvedUserId,
    String(recordId),
    kind,
  ].join(":");

  if (isIOSWebKit()) {
    const local =
      getIOSSignatureById(
        currentKey,
      );

    if (local) {
      return local;
    }

    /*
     * Compatibilidade com linhas antigas,
     * sem deixar NotFoundError quebrar o modal.
     */
    try {
      const current =
        await idbGet<OfflineSignature>(
          OFFLINE_STORES.signatures,
          currentKey,
        );

      if (current) {
        return current;
      }

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

      rows.sort(
        (a, b) =>
          Number(
            b.updatedAt ?? 0,
          ) -
          Number(
            a.updatedAt ?? 0,
          ),
      );

      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  const current =
    await idbGet<OfflineSignature>(
      OFFLINE_STORES.signatures,
      currentKey,
    );

  if (current) {
    return current;
  }

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
      Number(
        b.updatedAt ?? 0,
      ) -
      Number(
        a.updatedAt ?? 0,
      ),
  );

  return rows[0] ?? null;
}

export async function getSignaturesForUser(
  userId: string,
  statuses?:
    OfflineSignatureStatus[],
): Promise<OfflineSignature[]> {
  let rows:
    OfflineSignature[] = [];

  if (isIOSWebKit()) {
    rows =
      readIOSSignatures().filter(
        (row) =>
          String(
            row.userId,
          ) ===
          String(userId),
      );

    /*
     * Tenta incluir filas antigas do IndexedDB,
     * mas nunca deixa uma falha do WebKit bloquear
     * as assinaturas salvas no fallback.
     */
    try {
      const legacy =
        await idbGetAllByIndex<OfflineSignature>(
          OFFLINE_STORES.signatures,
          "userId",
          String(userId),
        );

      rows = [
        ...rows,
        ...legacy,
      ];
    } catch {
      // Sem ação.
    }
  } else {
    rows =
      await idbGetAllByIndex<OfflineSignature>(
        OFFLINE_STORES.signatures,
        "userId",
        String(userId),
      );
  }

  const filtered =
    statuses?.length
      ? rows.filter(
        (row) =>
          statuses.includes(
            row.status,
          ),
      )
      : rows;

  return latestByLogicalKey(
    filtered,
  ).sort(
    (a, b) =>
      Number(
        a.createdAt ?? 0,
      ) -
      Number(
        b.createdAt ?? 0,
      ),
  );
}

export async function updateOfflineSignature(
  signature:
    OfflineSignature,
  patch:
    Partial<OfflineSignature>,
): Promise<OfflineSignature> {
  const next:
    OfflineSignature = {
    ...signature,
    ...patch,
    updatedAt:
      Date.now(),
  };

  const normalized =
    await normalizeForStorage(
      next,
    );

  if (
    isIOSWebKit() ||
    signature.storage ===
    "ios-localStorage"
  ) {
    return putIOSSignature(
      normalized,
    );
  }

  await idbPut(
    OFFLINE_STORES.signatures,
    normalized,
  );

  return normalized;
}