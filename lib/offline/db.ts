"use client";

export const OFFLINE_DB_NAME = "pai-operacional-offline";
export const OFFLINE_DB_VERSION = 1;

export const OFFLINE_STORES = {
  records: "records",
  history: "history",
  actions: "actions",
  photos: "photos",
  materialChecks: "materialChecks",
  sessions: "sessions",
  meta: "meta",
} as const;

export type OfflineStoreName =
  (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no IndexedDB."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Transação IndexedDB cancelada."));
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação IndexedDB."));
  });
}

function createIndexIfMissing(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

function configureStore(
  db: IDBDatabase,
  tx: IDBTransaction,
  storeName: string,
  keyPath: string,
  indexes: Array<[string, string | string[], IDBIndexParameters?]>,
) {
  const store = db.objectStoreNames.contains(storeName)
    ? tx.objectStore(storeName)
    : db.createObjectStore(storeName, { keyPath });

  for (const [name, path, options] of indexes) {
    createIndexIfMissing(store, name, path, options);
  }
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB não está disponível neste navegador."));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;

      configureStore(db, tx, OFFLINE_STORES.records, "pk", [
        ["userId", "userId"],
        ["recordId", "recordId"],
        ["userRecord", ["userId", "recordId"], { unique: true }],
        ["updatedAt", "updatedAt"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.history, "pk", [
        ["userId", "userId"],
        ["recordId", "recordId"],
        ["userRecord", ["userId", "recordId"]],
        ["occurredAt", "occurredAt"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.actions, "operationId", [
        ["userId", "userId"],
        ["recordId", "recordId"],
        ["userStatus", ["userId", "status"]],
        ["userRecord", ["userId", "recordId"]],
        ["createdAt", "createdAt"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.photos, "photoId", [
        ["userId", "userId"],
        ["recordId", "recordId"],
        ["operationId", "operationId"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.materialChecks, "checkId", [
        ["userId", "userId"],
        ["recordId", "recordId"],
        ["operationId", "operationId"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.sessions, "userId", [
        ["lastSeenAt", "lastSeenAt"],
      ]);

      configureStore(db, tx, OFFLINE_STORES.meta, "key", []);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Não foi possível abrir o banco offline."));
    };

    request.onblocked = () => {
      console.warn("[OFFLINE] Atualização do IndexedDB bloqueada por outra aba aberta.");
    };
  });

  return dbPromise;
}

export async function idbGet<T>(storeName: OfflineStoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const result = await requestToPromise(tx.objectStore(storeName).get(key));
  await done;
  return result as T | undefined;
}

export async function idbPut<T>(storeName: OfflineStoreName, value: T): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(storeName).put(value as any);
  await done;
}

export async function idbDelete(storeName: OfflineStoreName, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(storeName).delete(key);
  await done;
}

export async function idbGetAll<T>(storeName: OfflineStoreName): Promise<T[]> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const result = await requestToPromise(tx.objectStore(storeName).getAll());
  await done;
  return (result ?? []) as T[];
}

export async function idbGetAllByIndex<T>(
  storeName: OfflineStoreName,
  indexName: string,
  query?: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const index = tx.objectStore(storeName).index(indexName);
  const request = query === undefined ? index.getAll() : index.getAll(query);
  const result = await requestToPromise(request);
  await done;
  return (result ?? []) as T[];
}

export async function replaceRecordsForUser(
  userId: string,
  rows: Array<{ pk: string; [key: string]: any }>,
): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.records, "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(OFFLINE_STORES.records);
  const index = store.index("userId");

  await new Promise<void>((resolve, reject) => {
    const req = index.openKeyCursor(IDBKeyRange.only(userId));
    req.onerror = () => reject(req.error ?? new Error("Falha ao limpar snapshot anterior."));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });

  for (const row of rows) {
    store.put(row);
  }

  await done;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await idbPut(OFFLINE_STORES.meta, { key, value, updatedAt: Date.now() });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await idbGet<{ key: string; value: T }>(OFFLINE_STORES.meta, key);
  return row?.value;
}

export function newOfflineId(prefix = "op"): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}
