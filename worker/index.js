/*
 * PAI 2.0
 * Background Sync operacional
 *
 * Este arquivo é incorporado ao /public/sw.js pelo next-pwa.
 * Ele trabalha diretamente com o mesmo IndexedDB da aplicação.
 *
 * Objetivo:
 * - Android/Chrome: tentar sincronizar quando a conexão voltar,
 *   inclusive com o PWA sem uma janela aberta.
 * - Qualquer navegador: não interfere na sincronização normal da página.
 */

const PAI_SYNC_TAG = "pai-operational-sync-v1";
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const DB_NAME = "pai-operacional-offline";

const STORES = {
  records: "records",
  actions: "actions",
  photos: "photos",
  materialChecks: "materialChecks",
  signatures: "signatures",
};

const FRESH_SENDING_MS = 30 * 1000;

class HttpSyncError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "HttpSyncError";
    this.status = Number(status || 0);
    this.body = body;
  }
}

class TransientSyncError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransientSyncError";
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
        new Error("Falha em operação IndexedDB no Service Worker.")
      );
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        tx.error ||
        new Error("Transação IndexedDB cancelada no Service Worker.")
      );
    tx.onerror = () =>
      reject(
        tx.error ||
        new Error("Falha na transação IndexedDB do Service Worker.")
      );
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    /*
     * Não informamos versão aqui.
     * O worker abre a versão atual criada por lib/offline/db.ts.
     * Isso evita VersionError caso o banco evolua futuramente.
     */
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
        new Error("Não foi possível abrir o banco offline no Service Worker.")
      );
  });
}

function hasStore(db, storeName) {
  return db.objectStoreNames.contains(storeName);
}

async function getAll(db, storeName) {
  if (!hasStore(db, storeName)) return [];

  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const rows = await requestToPromise(
    tx.objectStore(storeName).getAll()
  );
  await done;

  return Array.isArray(rows) ? rows : [];
}

async function getByKey(db, storeName, key) {
  if (!hasStore(db, storeName)) return undefined;

  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const row = await requestToPromise(
    tx.objectStore(storeName).get(key)
  );
  await done;

  return row;
}

async function putRow(db, storeName, value) {
  if (!hasStore(db, storeName)) {
    throw new Error(`Store offline ausente: ${storeName}`);
  }

  const tx = db.transaction(storeName, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(storeName).put(value);
  await done;
}

async function deleteRow(db, storeName, key) {
  if (!hasStore(db, storeName)) return;

  const tx = db.transaction(storeName, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(storeName).delete(key);
  await done;
}

async function patchCachedRegistro(db, recordId, userId, patch) {
  if (!hasStore(db, STORES.records)) return;

  const key = `${String(userId)}:${String(recordId)}`;
  const current = await getByKey(
    db,
    STORES.records,
    key
  );

  if (!current) return;

  await putRow(db, STORES.records, {
    ...current,
    data: {
      ...(current.data || {}),
      ...patch,
    },
    updatedAt: Date.now(),
  });
}

function isFreshSending(row) {
  if (String(row?.status || "") !== "sending") {
    return false;
  }

  const updatedAt = Number(row?.updatedAt || 0);

  return (
    updatedAt > 0 &&
    Date.now() - updatedAt < FRESH_SENDING_MS
  );
}

function isEligibleQueueStatus(row) {
  const status = String(row?.status || "");

  if (
    status === "pending" ||
    status === "blocked_auth"
  ) {
    return true;
  }

  if (
    status === "sending" &&
    !isFreshSending(row)
  ) {
    return true;
  }

  return false;
}

function isPermanentClientError(status) {
  return (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 422 ||
    (
      status >= 400 &&
      status < 500 &&
      status !== 401 &&
      status !== 403 &&
      status !== 408 &&
      status !== 425 &&
      status !== 429
    )
  );
}

function isTransientHttpStatus(status) {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function parseJsonResponse(response) {
  const data = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    data?.erro ||
    data?.need_login
  ) {
    throw new HttpSyncError(
      String(
        data?.msg ||
        data?.erro ||
        `HTTP ${response.status}`
      ),
      response.status,
      data
    );
  }

  return data;
}

async function resolveAuthenticatedUserId() {
  let response;

  try {
    response = await fetch(
      `${ENDPOINT}/informativo.php?me=1&_=${Date.now()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }
    );
  } catch (error) {
    throw new TransientSyncError(
      `Rede indisponível ao validar sessão: ${error?.message || "erro de rede"
      }`
    );
  }

  const data = await response
    .json()
    .catch(() => null);

  if (
    response.status === 401 ||
    response.status === 403 ||
    data?.need_login
  ) {
    return null;
  }

  if (!response.ok || !data || data?.erro) {
    if (isTransientHttpStatus(response.status)) {
      throw new TransientSyncError(
        String(
          data?.msg ||
          `Falha temporária ao validar sessão (${response.status}).`
        )
      );
    }

    return null;
  }

  const userId = String(data.id ?? "").trim();

  if (!userId || userId === "0") {
    return null;
  }

  return userId;
}

async function blobToDataUrl(blob) {
  const mime =
    blob?.type || "application/octet-stream";

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let binary = "";
  const chunkSize = 0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      Math.min(
        offset + chunkSize,
        bytes.length
      )
    );

    binary += String.fromCharCode.apply(
      null,
      Array.from(chunk)
    );
  }

  return `data:${mime};base64,${btoa(binary)}`;
}

async function syncSignature(signature) {
  let base64 =
    String(signature?.dataUrl || "").trim();

  /*
   * Compatibilidade com filas antigas que ainda armazenavam Blob.
   */
  if (!base64 && signature?.blob) {
    base64 = await blobToDataUrl(
      signature.blob
    );
  }

  if (!base64) {
    throw new Error(
      "Imagem da assinatura offline não encontrada."
    );
  }

  const response = await fetch(
    `${ENDPOINT}/informativo.php`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        acao: "salvar_assinatura",
        id: signature.recordId,
        tipo:
          signature.kind === "recebimento"
            ? "responsavel"
            : "requerente",
        base64,
        nome_assinatura: signature.name,
        cpf_assinatura: signature.cpf,
        operation_id: signature.operationId,
        ocorreu_em: signature.occurredAt,
        device_ocorreu_em:
          signature.deviceOccurredAt,
        clock_offset_ms:
          signature.clockOffsetMs,
        device_id: signature.deviceId,
        usuario_id: signature.userId,
        origem: "offline",
      }),
    }
  );

  return parseJsonResponse(response);
}

async function syncPhoto(db, action) {
  if (!action.photoId) return;

  const photo = await getByKey(
    db,
    STORES.photos,
    action.photoId
  );

  if (!photo) {
    throw new Error(
      "Foto offline não encontrada no aparelho."
    );
  }

  const form = new FormData();

  form.append(
    "acao",
    "salvar_foto_acao"
  );
  form.append(
    "id",
    String(action.recordId)
  );
  form.append(
    "tipo",
    String(photo.kind)
  );
  form.append(
    "foto",
    photo.blob,
    `${photo.kind}.jpg`
  );
  form.append(
    "operation_id",
    String(photo.operationId)
  );
  form.append(
    "ocorreu_em",
    String(photo.capturedAt)
  );
  form.append(
    "device_id",
    String(photo.deviceId)
  );
  form.append(
    "usuario_id",
    String(photo.userId)
  );
  form.append(
    "origem",
    "offline"
  );

  const response = await fetch(
    `${ENDPOINT}/informativo.php`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      body: form,
    }
  );

  await parseJsonResponse(response);
}

async function syncMaterialCheck(db, action) {
  if (!action.materialCheckId) return;

  const check = await getByKey(
    db,
    STORES.materialChecks,
    action.materialCheckId
  );

  if (!check) {
    throw new Error(
      "Conferência de materiais offline não encontrada."
    );
  }

  const response = await fetch(
    `${ENDPOINT}/materiais_admin.php?op=conferencia_create`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registro_id: Number(check.recordId),
        falecido_nome:
          check.falecidoNome,
        observacao:
          check.observacao,
        itens:
          check.itens,
        operation_id:
          check.operationId,
        ocorreu_em:
          check.occurredAt,
        device_id:
          check.deviceId,
        usuario_id:
          check.userId,
        origem:
          "offline",
      }),
    }
  );

  await parseJsonResponse(response);
}

async function syncStatus(action) {
  const common = {
    id: action.recordId,
    operation_id:
      action.operationId,
    ocorreu_em:
      action.occurredAt,
    device_ocorreu_em:
      action.deviceOccurredAt,
    clock_offset_ms:
      action.clockOffsetMs,
    device_id:
      action.deviceId,
    usuario_id:
      action.userId,
    origem:
      "offline",
    status_anterior:
      action.statusAnterior,
  };

  const body =
    action.command === "fase11"
      ? {
        acao:
          "material_recolhido",
        ...common,
      }
      : {
        acao:
          "atualizar_status",
        status:
          action.statusNovo,
        ...common,
      };

  const response = await fetch(
    `${ENDPOINT}/informativo.php`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  await parseJsonResponse(response);
}

async function markSignatureError(
  db,
  signature,
  error,
  summary
) {
  const status = Number(
    error?.status || 0
  );

  const message = String(
    error?.message ||
    "Falha ao sincronizar assinatura."
  );

  if (
    status === 401 ||
    status === 403
  ) {
    await putRow(
      db,
      STORES.signatures,
      {
        ...signature,
        status:
          "blocked_auth",
        lastError:
          message,
        updatedAt:
          Date.now(),
      }
    );

    summary.blockedAuth = true;

    return "auth";
  }

  if (isPermanentClientError(status)) {
    await putRow(
      db,
      STORES.signatures,
      {
        ...signature,
        status:
          "requires_attention",
        lastError:
          message,
        updatedAt:
          Date.now(),
      }
    );

    await patchCachedRegistro(
      db,
      signature.recordId,
      signature.userId,
      signature.kind === "recebimento"
        ? {
          __assinaturaRecebimentoStatus:
            "requires_attention",
        }
        : {
          __assinaturaRequisicaoStatus:
            "requires_attention",
        }
    );

    summary.requiresAttention += 1;

    return "permanent";
  }

  await putRow(
    db,
    STORES.signatures,
    {
      ...signature,
      status:
        "pending",
      lastError:
        message,
      updatedAt:
        Date.now(),
    }
  );

  throw new TransientSyncError(message);
}

async function syncSignaturesForUser(
  db,
  userId,
  summary,
  state
) {
  const all = await getAll(
    db,
    STORES.signatures
  );

  const rows = all
    .filter(
      (row) =>
        String(row?.userId) ===
        String(userId)
    )
    .sort(
      (a, b) =>
        Number(a?.createdAt || 0) -
        Number(b?.createdAt || 0)
    );

  for (const original of rows) {
    if (isFreshSending(original)) {
      state.retryNeeded = true;
      continue;
    }

    if (!isEligibleQueueStatus(original)) {
      continue;
    }

    summary.attempted += 1;

    let signature = {
      ...original,
      status:
        "sending",
      tries:
        Number(original.tries || 0) + 1,
      lastError:
        undefined,
      updatedAt:
        Date.now(),
    };

    await putRow(
      db,
      STORES.signatures,
      signature
    );

    try {
      const data =
        await syncSignature(signature);

      const serverUrl = String(
        data?.url ||
        signature.serverUrl ||
        ""
      ).trim();

      signature = {
        ...signature,
        status:
          "synced",
        syncedAt:
          new Date().toISOString(),
        serverUrl,
        lastError:
          undefined,
        updatedAt:
          Date.now(),
      };

      await putRow(
        db,
        STORES.signatures,
        signature
      );

      await patchCachedRegistro(
        db,
        signature.recordId,
        signature.userId,
        signature.kind === "recebimento"
          ? {
            assinatura_responsavel:
              serverUrl,
            assinatura_recebimento_url:
              serverUrl,
            assinatura_responsavel_nome:
              signature.name,
            assinatura_responsavel_cpf:
              signature.cpf,
            __assinaturaRecebimentoStatus:
              "synced",
          }
          : {
            assinatura_requerente:
              serverUrl,
            assinatura_requisicao_url:
              serverUrl,
            assinatura_requerente_nome:
              signature.name,
            assinatura_requerente_cpf:
              signature.cpf,
            __assinaturaRequisicaoStatus:
              "synced",
          }
      );

      summary.synced += 1;
    } catch (error) {
      const result =
        await markSignatureError(
          db,
          signature,
          error,
          summary
        );

      if (result === "auth") {
        return false;
      }
    }
  }

  return true;
}

async function markActionError(
  db,
  action,
  error,
  summary
) {
  const status = Number(
    error?.status || 0
  );

  const message = String(
    error?.message ||
    "Falha ao sincronizar ação."
  );

  if (
    status === 401 ||
    status === 403
  ) {
    await putRow(
      db,
      STORES.actions,
      {
        ...action,
        status:
          "blocked_auth",
        lastError:
          message,
        updatedAt:
          Date.now(),
      }
    );

    summary.blockedAuth = true;

    return "auth";
  }

  if (isPermanentClientError(status)) {
    await putRow(
      db,
      STORES.actions,
      {
        ...action,
        status:
          "requires_attention",
        lastError:
          message,
        updatedAt:
          Date.now(),
      }
    );

    await patchCachedRegistro(
      db,
      action.recordId,
      action.userId,
      {
        __syncStatus:
          "requires_attention",
      }
    );

    summary.requiresAttention += 1;

    return "permanent";
  }

  await putRow(
    db,
    STORES.actions,
    {
      ...action,
      status:
        "pending",
      lastError:
        message,
      updatedAt:
        Date.now(),
    }
  );

  throw new TransientSyncError(message);
}

async function syncActionsForUser(
  db,
  userId,
  summary,
  state
) {
  const all = await getAll(
    db,
    STORES.actions
  );

  const rows = all
    .filter(
      (row) =>
        String(row?.userId) ===
        String(userId)
    )
    .sort(
      (a, b) =>
        Number(a?.createdAt || 0) -
        Number(b?.createdAt || 0)
    );

  const blockedRecords =
    new Set();

  for (const original of rows) {
    const recordId =
      String(
        original?.recordId || ""
      );

    if (
      !recordId ||
      blockedRecords.has(recordId)
    ) {
      continue;
    }

    if (isFreshSending(original)) {
      state.retryNeeded = true;
      continue;
    }

    if (!isEligibleQueueStatus(original)) {
      continue;
    }

    summary.attempted += 1;

    let action = {
      ...original,
      status:
        "sending",
      tries:
        Number(original.tries || 0) + 1,
      lastError:
        undefined,
      updatedAt:
        Date.now(),
    };

    await putRow(
      db,
      STORES.actions,
      action
    );

    try {
      await syncPhoto(
        db,
        action
      );

      await syncMaterialCheck(
        db,
        action
      );

      await syncStatus(
        action
      );

      action = {
        ...action,
        status:
          "synced",
        syncedAt:
          new Date().toISOString(),
        lastError:
          undefined,
        updatedAt:
          Date.now(),
      };

      await putRow(
        db,
        STORES.actions,
        action
      );

      await patchCachedRegistro(
        db,
        action.recordId,
        action.userId,
        {
          status:
            action.statusNovo,
          agente:
            action.userName,
          __syncStatus:
            "synced",
          __pendingCount:
            0,
          __lastOfflineOccurredAt:
            action.occurredAt,
        }
      );

      if (action.photoId) {
        await deleteRow(
          db,
          STORES.photos,
          action.photoId
        );
      }

      if (action.materialCheckId) {
        await deleteRow(
          db,
          STORES.materialChecks,
          action.materialCheckId
        );
      }

      summary.synced += 1;
    } catch (error) {
      const result =
        await markActionError(
          db,
          action,
          error,
          summary
        );

      if (result === "auth") {
        return false;
      }

      if (result === "permanent") {
        blockedRecords.add(
          recordId
        );
      }
    }
  }

  return true;
}

async function notifyClients(summary) {
  try {
    const windows =
      await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

    for (const client of windows) {
      client.postMessage({
        type:
          "PAI_BACKGROUND_SYNC_COMPLETE",
        summary,
      });
    }
  } catch {
    // O sync continua válido mesmo sem nenhuma janela aberta.
  }
}

async function executeBackgroundSync() {
  const summary = {
    source:
      "service-worker",
    attempted:
      0,
    synced:
      0,
    requiresAttention:
      0,
    blockedAuth:
      false,
    transientFailure:
      false,
  };

  let db;

  try {
    db = await openDb();

    /*
     * Um pedido de sync só é registrado depois que a aplicação
     * já criou suas stores. Ainda assim, verificamos antes de usar.
     */
    if (
      !hasStore(db, STORES.actions) &&
      !hasStore(db, STORES.signatures)
    ) {
      return summary;
    }

    const userId =
      await resolveAuthenticatedUserId();

    if (!userId) {
      summary.blockedAuth = true;
      return summary;
    }

    const state = {
      retryNeeded: false,
    };

    const signaturesOk =
      await syncSignaturesForUser(
        db,
        userId,
        summary,
        state
      );

    if (
      signaturesOk &&
      !summary.blockedAuth
    ) {
      await syncActionsForUser(
        db,
        userId,
        summary,
        state
      );
    }

    /*
     * Se outra instância acabou de marcar algo como sending,
     * não enviamos simultaneamente. Pedimos ao Chrome para tentar
     * de novo depois, evitando corrida entre página e worker.
     */
    if (
      state.retryNeeded &&
      !summary.blockedAuth
    ) {
      throw new TransientSyncError(
        "Há operação em envio por outra instância."
      );
    }

    return summary;
  } catch (error) {
    if (
      error?.name ===
      "TransientSyncError"
    ) {
      summary.transientFailure = true;
    }

    throw Object.assign(error, {
      paiSummary: summary,
    });
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Sem ação.
      }
    }

    await notifyClients(summary);
  }
}

self.addEventListener(
  "sync",
  (event) => {
    if (
      event.tag !== PAI_SYNC_TAG
    ) {
      return;
    }

    /*
     * Se executeBackgroundSync rejeitar por erro transitório,
     * o navegador mantém a semântica de Background Sync e pode
     * tentar novamente com backoff.
     */
    event.waitUntil(
      executeBackgroundSync()
    );
  }
);

/*
 * Canal opcional para diagnóstico ou acionamento futuro.
 * A aplicação atual não depende dele para funcionar.
 */
self.addEventListener(
  "message",
  (event) => {
    if (
      event?.data?.type !==
      "PAI_SYNC_NOW"
    ) {
      return;
    }

    const promise =
      executeBackgroundSync()
        .catch(() => undefined);

    if (
      typeof event.waitUntil ===
      "function"
    ) {
      event.waitUntil(promise);
    }
  }
);
