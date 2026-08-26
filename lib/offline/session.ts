"use client";

import {
  OFFLINE_STORES,
  getMeta,
  idbGet,
  idbPut,
  setMeta,
} from "./db";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const ACTIVE_USER_META = "activeUserId";

export type OfflineSession = {
  userId: string;
  userName: string;
  login: string;
  cargo: string;
  depositoInsumos: string | null;
  podeConservacao: boolean;
  serverTimeAtSync: number;
  deviceTimeAtSync: number;
  clockOffsetMs: number;
  lastSeenAt: number;
};

type MeResponse = {
  sucesso?: boolean;
  erro?: boolean;
  msg?: string;
  id?: number | string;
  usuario?: string;
  nome?: string;
  cargo?: string;
  deposito_insumos?: string | null;
  pode_conservacao?: boolean | number | string;
  server_time?: string;
  server_time_unix_ms?: number | string;
};

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || String(v ?? "").toLowerCase() === "true";
}

export function browserSaysOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function refreshOfflineSession(): Promise<OfflineSession> {
  const startedAt = Date.now();
  const response = await fetch(`${ENDPOINT}/informativo.php?me=1&_=${startedAt}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const endedAt = Date.now();

  const data = (await response.json().catch(() => null)) as MeResponse | null;
  if (!response.ok || !data || data.erro) {
    const err: any = new Error(data?.msg || `Falha ao identificar usuário (${response.status}).`);
    err.status = response.status;
    throw err;
  }

  const userId = String(data.id ?? "").trim();
  if (!userId || userId === "0") throw new Error("Usuário autenticado sem ID válido.");

  const serverMsRaw = Number(data.server_time_unix_ms ?? 0);
  const parsedIso = data.server_time ? Date.parse(data.server_time) : NaN;
  const serverMs = Number.isFinite(serverMsRaw) && serverMsRaw > 0
    ? serverMsRaw
    : Number.isFinite(parsedIso)
      ? parsedIso
      : endedAt;

  const midpoint = Math.round((startedAt + endedAt) / 2);
  const session: OfflineSession = {
    userId,
    userName: String(data.nome ?? data.usuario ?? "").trim() || `Usuário ${userId}`,
    login: String(data.usuario ?? "").trim(),
    cargo: String(data.cargo ?? "").trim().toLowerCase(),
    depositoInsumos:
      typeof data.deposito_insumos === "string" && data.deposito_insumos.trim()
        ? data.deposito_insumos.trim()
        : null,
    podeConservacao: asBool(data.pode_conservacao),
    serverTimeAtSync: serverMs,
    deviceTimeAtSync: midpoint,
    clockOffsetMs: serverMs - midpoint,
    lastSeenAt: Date.now(),
  };

  await idbPut(OFFLINE_STORES.sessions, session);
  await setMeta(ACTIVE_USER_META, userId);
  return session;
}

export async function getActiveOfflineUserId(): Promise<string | null> {
  const userId = await getMeta<string>(ACTIVE_USER_META);
  return userId ? String(userId) : null;
}

export async function getCachedOfflineSession(userId?: string | null): Promise<OfflineSession | null> {
  const resolved = userId ?? (await getActiveOfflineUserId());
  if (!resolved) return null;

  const row = await idbGet<OfflineSession>(OFFLINE_STORES.sessions, String(resolved));
  return row ?? null;
}

export async function getCurrentOfflineSession(options?: {
  refreshIfOnline?: boolean;
  allowCachedOnNetworkFailure?: boolean;
}): Promise<OfflineSession | null> {
  const refreshIfOnline = options?.refreshIfOnline !== false;
  const allowCachedOnNetworkFailure = options?.allowCachedOnNetworkFailure !== false;

  if (refreshIfOnline && browserSaysOnline()) {
    try {
      return await refreshOfflineSession();
    } catch (error: any) {
      // Se o servidor respondeu 401/403, não reutilizamos uma identidade antiga.
      if (error?.status === 401 || error?.status === 403) {
        await clearActiveOfflineSession();
        throw error;
      }
      if (!allowCachedOnNetworkFailure) throw error;
    }
  }

  return getCachedOfflineSession();
}

export async function clearActiveOfflineSession(): Promise<void> {
  await setMeta(ACTIVE_USER_META, null);
}
