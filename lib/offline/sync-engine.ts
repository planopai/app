"use client";

import {
  getActionsForUser,
  type OfflineAction,
  updateOfflineAction,
} from "./actions";
import { deleteOfflineMaterialCheck, getOfflineMaterialCheck } from "./material-checks";
import { deleteOfflinePhoto, getOfflinePhoto } from "./photos";
import { patchCachedRegistro } from "./registros";
import { browserSaysOnline, refreshOfflineSession } from "./session";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

let running: Promise<SyncSummary> | null = null;

export type SyncSummary = {
  attempted: number;
  synced: number;
  requiresAttention: number;
  blockedAuth: boolean;
};

class HttpSyncError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "HttpSyncError";
    this.status = status;
    this.body = body;
  }
}

function isNetworkLike(error: any): boolean {
  if (!error) return false;
  if (error?.name === "TypeError" || error?.name === "AbortError") return true;
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("offline")
  );
}

async function parseJsonResponse(response: Response): Promise<any> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.erro || data?.need_login) {
    throw new HttpSyncError(
      String(data?.msg ?? data?.erro ?? `HTTP ${response.status}`),
      response.status,
      data,
    );
  }
  return data;
}

async function syncPhoto(action: OfflineAction): Promise<void> {
  if (!action.photoId) return;
  const photo = await getOfflinePhoto(action.photoId);
  if (!photo) throw new Error("Foto offline não encontrada no aparelho.");

  const form = new FormData();
  form.append("acao", "salvar_foto_acao");
  form.append("id", action.recordId);
  form.append("tipo", photo.kind);
  form.append("foto", photo.blob, `${photo.kind}.jpg`);
  form.append("operation_id", photo.operationId);
  form.append("ocorreu_em", photo.capturedAt);
  form.append("device_id", photo.deviceId);
  form.append("usuario_id", photo.userId);
  form.append("origem", "offline");

  const response = await fetch(`${ENDPOINT}/informativo.php`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    body: form,
  });
  await parseJsonResponse(response);
}

async function syncMaterialCheck(action: OfflineAction): Promise<void> {
  if (!action.materialCheckId) return;
  const check = await getOfflineMaterialCheck(action.materialCheckId);
  if (!check) throw new Error("Conferência de materiais offline não encontrada.");

  const response = await fetch(`${ENDPOINT}/materiais_admin.php?op=conferencia_create`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      registro_id: Number(check.recordId),
      falecido_nome: check.falecidoNome,
      observacao: check.observacao,
      itens: check.itens,
      operation_id: check.operationId,
      ocorreu_em: check.occurredAt,
      device_id: check.deviceId,
      usuario_id: check.userId,
      origem: "offline",
    }),
  });
  await parseJsonResponse(response);
}

async function syncStatus(action: OfflineAction): Promise<void> {
  const common = {
    id: action.recordId,
    operation_id: action.operationId,
    ocorreu_em: action.occurredAt,
    device_ocorreu_em: action.deviceOccurredAt,
    clock_offset_ms: action.clockOffsetMs,
    device_id: action.deviceId,
    usuario_id: action.userId,
    origem: "offline",
    status_anterior: action.statusAnterior,
  };

  const body = action.command === "fase11"
    ? {
        acao: "material_recolhido",
        ...common,
      }
    : {
        acao: "atualizar_status",
        status: action.statusNovo,
        ...common,
      };

  const response = await fetch(`${ENDPOINT}/informativo.php`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  await parseJsonResponse(response);
}

async function runSync(): Promise<SyncSummary> {
  const summary: SyncSummary = {
    attempted: 0,
    synced: 0,
    requiresAttention: 0,
    blockedAuth: false,
  };

  if (!browserSaysOnline()) return summary;

  let session;
  try {
    session = await refreshOfflineSession();
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) summary.blockedAuth = true;
    return summary;
  }

  const actions = await getActionsForUser(session.userId, [
    "pending",
    "sending",
    "blocked_auth",
  ]);
  const blockedRecords = new Set<string>();

  for (const original of actions) {
    if (!browserSaysOnline()) break;
    if (blockedRecords.has(original.recordId)) continue;

    if (String(original.userId) !== String(session.userId)) {
      blockedRecords.add(original.recordId);
      continue;
    }

    summary.attempted += 1;
    let action = await updateOfflineAction(original, {
      status: "sending",
      tries: Number(original.tries ?? 0) + 1,
      lastError: undefined,
    });

    try {
      await syncPhoto(action);
      await syncMaterialCheck(action);
      await syncStatus(action);

      const syncedAt = new Date().toISOString();
      action = await updateOfflineAction(action, {
        status: "synced",
        syncedAt,
        lastError: undefined,
      });

      await patchCachedRegistro(action.recordId, {
        status: action.statusNovo,
        agente: action.userName,
        __syncStatus: "synced",
        __pendingCount: 0,
        __lastOfflineOccurredAt: action.occurredAt,
      }, action.userId);

      if (action.photoId) await deleteOfflinePhoto(action.photoId);
      if (action.materialCheckId) await deleteOfflineMaterialCheck(action.materialCheckId);

      summary.synced += 1;
    } catch (error: any) {
      const status = Number(error?.status ?? 0);
      const message = String(error?.message ?? "Falha ao sincronizar.");

      if (status === 401 || status === 403) {
        await updateOfflineAction(action, { status: "blocked_auth", lastError: message });
        summary.blockedAuth = true;
        break;
      }

      if (status === 400 || status === 404 || status === 409 || status === 422) {
        await updateOfflineAction(action, { status: "requires_attention", lastError: message });
        await patchCachedRegistro(action.recordId, { __syncStatus: "requires_attention" }, action.userId);
        summary.requiresAttention += 1;
        blockedRecords.add(action.recordId);
        continue;
      }

      await updateOfflineAction(action, { status: "pending", lastError: message });
      if (isNetworkLike(error) || status >= 500 || status === 0) break;
      blockedRecords.add(action.recordId);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pai-offline-sync-complete", { detail: summary }));
  }

  return summary;
}

export function syncOperationalQueue(): Promise<SyncSummary> {
  if (running) return running;
  running = runSync().finally(() => {
    running = null;
  });
  return running;
}

export function installOperationalSyncListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const run = () => {
    if (browserSaysOnline()) void syncOperationalQueue();
  };
  const visibility = () => {
    if (document.visibilityState === "visible") run();
  };

  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", visibility);

  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", visibility);
  };
}
