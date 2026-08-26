

import {
  OFFLINE_STORES,
  getMeta,
  idbGet,
  idbPut,
  setMeta,
} from "./db";

const ENDPOINT =
  "https://api.planoassistencialintegrado.com.br";

const ACTIVE_USER_META =
  "activeUserId";

const SESSION_FALLBACK_ACTIVE =
  "pai_offline_active_user_v1";

const SESSION_FALLBACK_PREFIX =
  "pai_offline_session_v1:";

export type OfflineSession = {
  userId: string;
  userName: string;
  login: string;
  cargo: string;
  depositoInsumos:
  | string
  | null;
  podeConservacao: boolean;
  serverTimeAtSync: number;
  deviceTimeAtSync: number;
  clockOffsetMs: number;
  lastSeenAt: number;
};

type MeResponse = {
  sucesso?: boolean;
  erro?: boolean;
  need_login?: boolean;
  msg?: string;
  id?:
  | number
  | string;
  usuario?: string;
  nome?: string;
  cargo?: string;
  deposito_insumos?:
  | string
  | null;
  pode_conservacao?:
  | boolean
  | number
  | string;
  server_time?: string;
  server_time_unix_ms?:
  | number
  | string;
};

function asBool(
  v: unknown,
): boolean {
  return (
    v === true ||
    v === 1 ||
    v === "1" ||
    String(v ?? "")
      .toLowerCase() ===
    "true"
  );
}

function safeLocalStorage():
  Storage | null {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function saveSessionFallback(
  session: OfflineSession,
): void {
  const storage =
    safeLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      SESSION_FALLBACK_ACTIVE,
      session.userId,
    );

    storage.setItem(
      `${SESSION_FALLBACK_PREFIX}${session.userId}`,
      JSON.stringify(session),
    );
  } catch {
    // IndexedDB continua sendo a camada principal quando disponível.
  }
}

function readActiveFallback():
  string | null {
  const storage =
    safeLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const value =
      storage.getItem(
        SESSION_FALLBACK_ACTIVE,
      );

    return value
      ? String(value)
      : null;
  } catch {
    return null;
  }
}

function readSessionFallback(
  userId: string,
): OfflineSession | null {
  const storage =
    safeLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw =
      storage.getItem(
        `${SESSION_FALLBACK_PREFIX}${userId}`,
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

export function browserSaysOnline():
  boolean {
  return (
    typeof navigator ===
    "undefined" ||
    navigator.onLine !== false
  );
}

export async function refreshOfflineSession():
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
    (await response
      .json()
      .catch(
        () => null,
      )) as MeResponse | null;

  if (
    !response.ok ||
    !data ||
    data.erro ||
    data.need_login
  ) {
    const err: any =
      new Error(
        data?.msg ||
        `Falha ao identificar usuário (${response.status}).`,
      );

    err.status =
      response.status;

    throw err;
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
      (startedAt + endedAt) /
      2,
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
      asBool(
        data.pode_conservacao,
      ),
    serverTimeAtSync:
      serverMs,
    deviceTimeAtSync:
      midpoint,
    clockOffsetMs:
      serverMs - midpoint,
    lastSeenAt:
      Date.now(),
  };

  /*
   * Grava primeiro uma cópia simples.
   * Assim o iPhone mantém a identidade mesmo se o
   * processo de IndexedDB do WebKit estiver instável.
   */
  saveSessionFallback(session);

  try {
    await idbPut(
      OFFLINE_STORES.sessions,
      session,
    );

    await setMeta(
      ACTIVE_USER_META,
      userId,
    );
  } catch (error) {
    console.warn(
      "[OFFLINE] Sessão mantida no fallback local porque o IndexedDB não respondeu.",
      error,
    );
  }

  return session;
}

export async function getActiveOfflineUserId():
  Promise<string | null> {
  try {
    const userId =
      await getMeta<string>(
        ACTIVE_USER_META,
      );

    if (userId) {
      return String(userId);
    }
  } catch {
    // Usa fallback abaixo.
  }

  return readActiveFallback();
}

export async function getCachedOfflineSession(
  userId?:
    | string
    | null,
): Promise<OfflineSession | null> {
  const resolved =
    userId ??
    (await getActiveOfflineUserId());

  if (!resolved) {
    return null;
  }

  try {
    const row =
      await idbGet<OfflineSession>(
        OFFLINE_STORES.sessions,
        String(resolved),
      );

    if (row) {
      saveSessionFallback(row);
      return row;
    }
  } catch {
    // Usa fallback abaixo.
  }

  return readSessionFallback(
    String(resolved),
  );
}

export async function getCurrentOfflineSession(
  options?: {
    refreshIfOnline?: boolean;
    allowCachedOnNetworkFailure?:
    boolean;
  },
): Promise<OfflineSession | null> {
  const refreshIfOnline =
    options?.refreshIfOnline !==
    false;

  const allowCachedOnNetworkFailure =
    options
      ?.allowCachedOnNetworkFailure !==
    false;

  if (
    refreshIfOnline &&
    browserSaysOnline()
  ) {
    try {
      return await refreshOfflineSession();
    } catch (error: any) {
      if (
        error?.status === 401 ||
        error?.status === 403
      ) {
        await clearActiveOfflineSession();
        throw error;
      }

      if (
        !allowCachedOnNetworkFailure
      ) {
        throw error;
      }
    }
  }

  return getCachedOfflineSession();
}

export async function clearActiveOfflineSession():
  Promise<void> {
  const storage =
    safeLocalStorage();

  if (storage) {
    try {
      storage.removeItem(
        SESSION_FALLBACK_ACTIVE,
      );
    } catch {
      // Sem ação.
    }
  }

  try {
    await setMeta(
      ACTIVE_USER_META,
      null,
    );
  } catch {
    // Fallback já foi limpo.
  }
}