"use client";

import {
  OFFLINE_STORES,
  idbGetAllByIndex,
  idbPut,
  newOfflineId,
} from "./db";
import { getOperationalTimestamp } from "./clock";
import { getOfflineDeviceId } from "./device";
import { patchCachedRegistro } from "./registros";
import { getCurrentOfflineSession, type OfflineSession } from "./session";

export type OfflineCommand = "fase08" | "fase10" | "fase11";
export type OfflineActionStatus =
  | "pending"
  | "sending"
  | "synced"
  | "requires_attention"
  | "blocked_auth";

export type OfflineAction = {
  operationId: string;
  userId: string;
  userName: string;
  recordId: string;
  command: OfflineCommand;
  label: string;
  statusAnterior: string;
  statusNovo: string;
  occurredAt: string;
  deviceOccurredAt: string;
  clockOffsetMs: number;
  deviceId: string;
  photoId?: string;
  photoAlreadyUploaded?: boolean;
  materialCheckId?: string;
  materialCheckAlreadyUploaded?: boolean;
  status: OfflineActionStatus;
  tries: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  syncedAt?: string;
};

const LABELS: Record<OfflineCommand, string> = {
  fase08: "Entrega de Corpo",
  fase10: "Sepultamento Concluído",
  fase11: "Material Recolhido",
};

function normalizeStatus(status: unknown): string {
  const raw = String(status ?? "").trim().toLowerCase();
  if (!raw) return "fase00";
  if (raw.startsWith("fase")) {
    const digits = raw.replace(/\D+/g, "");
    return digits ? `fase${digits.padStart(2, "0")}` : raw;
  }
  return raw;
}

export function isOperationalOfflineCommand(command: string): command is OfflineCommand {
  return command === "fase08" || command === "fase10" || command === "fase11";
}

export function validateOfflineResponsibility(
  registro: any,
  command: OfflineCommand,
  session: OfflineSession,
): { ok: true } | { ok: false; message: string } {
  if (command === "fase08") {
    const ownerId = String(registro?.responsavel_velorio_id ?? "").trim();
    const ownerName = String(registro?.responsavel_velorio_nome ?? "").trim();

    if (!ownerId || ownerId === "0") {
      return {
        ok: false,
        message: "O transporte para o velório precisa ser iniciado online antes da Entrega de Corpo offline.",
      };
    }

    if (ownerId !== String(session.userId)) {
      return {
        ok: false,
        message: `Somente ${ownerName || "o agente que iniciou o transporte para o velório"} pode confirmar a Entrega de Corpo.`,
      };
    }
  }

  if (command === "fase10") {
    const ownerId = String(registro?.responsavel_sepultamento_id ?? "").trim();
    const ownerName = String(registro?.responsavel_sepultamento_nome ?? "").trim();

    if (!ownerId || ownerId === "0") {
      return {
        ok: false,
        message: "Transportando P/ Sepultamento precisa ser confirmado online antes da conclusão offline.",
      };
    }

    if (ownerId !== String(session.userId)) {
      return {
        ok: false,
        message: `Somente ${ownerName || "o agente que iniciou o transporte para sepultamento"} pode concluir o sepultamento.`,
      };
    }
  }

  return { ok: true };
}

export async function queueOperationalAction(input: {
  registro: any;
  command: OfflineCommand;
  photoId?: string;
  photoAlreadyUploaded?: boolean;
  materialCheckId?: string;
  materialCheckAlreadyUploaded?: boolean;
  operationId?: string;
  occurredAt?: string;
}): Promise<OfflineAction> {
  const session = await getCurrentOfflineSession({ refreshIfOnline: false });
  if (!session) {
    throw new Error("Usuário offline não identificado. Abra o PAI online antes de sair da empresa.");
  }

  const validation = validateOfflineResponsibility(input.registro, input.command, session);
  if (!validation.ok) throw new Error(validation.message);

  if (input.command === "fase08" && !input.photoId && !input.photoAlreadyUploaded) {
    throw new Error("A foto da Entrega de Corpo é obrigatória.");
  }

  if (input.command === "fase11" && !input.materialCheckId && !input.materialCheckAlreadyUploaded) {
    throw new Error("A conferência de materiais precisa ser concluída antes de Material Recolhido.");
  }

  const timestamp = await getOperationalTimestamp();
  const deviceId = await getOfflineDeviceId();
  const recordId = String(input.registro?.id ?? input.registro?.sepultamento_id ?? "").trim();
  if (!recordId) throw new Error("Atendimento inválido para operação offline.");

  const currentLocal = normalizeStatus(input.registro?.status);
  const action: OfflineAction = {
    operationId: input.operationId ?? newOfflineId("status-op"),
    userId: session.userId,
    userName: session.userName,
    recordId,
    command: input.command,
    label: LABELS[input.command],
    statusAnterior: currentLocal,
    statusNovo: input.command,
    occurredAt: input.occurredAt ?? timestamp.occurredAt,
    deviceOccurredAt: timestamp.deviceOccurredAt,
    clockOffsetMs: timestamp.clockOffsetMs,
    deviceId,
    photoId: input.photoId,
    photoAlreadyUploaded: !!input.photoAlreadyUploaded,
    materialCheckId: input.materialCheckId,
    materialCheckAlreadyUploaded: !!input.materialCheckAlreadyUploaded,
    status: "pending",
    tries: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await idbPut(OFFLINE_STORES.actions, action);
  await patchCachedRegistro(recordId, {
    status: input.command,
    agente: session.userName,
    __syncStatus: "pending",
    __lastOfflineOccurredAt: action.occurredAt,
  });

  return action;
}

export async function getActionsForUser(
  userId: string,
  statuses?: OfflineActionStatus[],
): Promise<OfflineAction[]> {
  const all = await idbGetAllByIndex<OfflineAction>(
    OFFLINE_STORES.actions,
    "userId",
    IDBKeyRange.only(String(userId)),
  );

  const filtered = statuses?.length
    ? all.filter((item) => statuses.includes(item.status))
    : all;

  return filtered.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingOperationalActions(
  userId: string,
): Promise<OfflineAction[]> {
  return getActionsForUser(userId, ["pending", "sending", "blocked_auth", "requires_attention"]);
}

export async function updateOfflineAction(
  action: OfflineAction,
  patch: Partial<OfflineAction>,
): Promise<OfflineAction> {
  const next: OfflineAction = {
    ...action,
    ...patch,
    updatedAt: Date.now(),
  };
  await idbPut(OFFLINE_STORES.actions, next);
  return next;
}

export async function applyPendingActionsToRegistros<T extends Record<string, any>>(
  registros: T[],
  userId: string,
): Promise<T[]> {
  const actions = await getActionsForUser(userId, ["pending", "sending", "blocked_auth", "requires_attention"]);
  const grouped = new Map<string, OfflineAction[]>();

  for (const action of actions) {
    const list = grouped.get(action.recordId) ?? [];
    list.push(action);
    grouped.set(action.recordId, list);
  }

  return registros.map((registro) => {
    const recordId = String((registro as any)?.id ?? (registro as any)?.sepultamento_id ?? "");
    const list = (grouped.get(recordId) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    if (!list.length) return registro;

    const last = list[list.length - 1];
    const needsAttention = list.some((a) => a.status === "requires_attention");

    return {
      ...registro,
      status: last.statusNovo,
      agente: last.userName,
      __syncStatus: needsAttention ? "requires_attention" : "pending",
      __pendingCount: list.filter((a) => a.status !== "requires_attention").length,
      __pendingActions: list,
      __lastOfflineOccurredAt: last.occurredAt,
    } as T;
  });
}
