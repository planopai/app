"use client";

export const LOCAL_ATTENDANCE_PREFIX =
    "local-atendimento-";

const STORAGE_KEY =
    "pai_local_attendances_v1";

export type LocalAttendancePhase01 = {
    operationId: string;
    occurredAt: string;
    deviceOccurredAt: string;
    clockOffsetMs: number;
    deviceId: string;
    userId: string;
    userName: string;
    status: "pending" | "synced";
    syncedAt?: string;
};

export type LocalAttendanceEntry = {
    localId: string;
    userId: string;
    userName: string;
    operationId: string;
    createdAt: number;
    updatedAt: number;
    serverId?: string;
    record: Record<string, any>;
    phase01?: LocalAttendancePhase01;
};

function safeStorage(): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readAll(): LocalAttendanceEntry[] {
    const storage = safeStorage();

    if (!storage) {
        return [];
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed)
            ? (parsed as LocalAttendanceEntry[])
            : [];
    } catch {
        return [];
    }
}

function writeAll(
    rows: LocalAttendanceEntry[],
): void {
    const storage = safeStorage();

    if (!storage) {
        throw new Error(
            "Armazenamento local indisponível neste aparelho.",
        );
    }

    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify(rows),
        );
    } catch {
        throw new Error(
            "Não foi possível guardar o atendimento no aparelho. Verifique o espaço disponível.",
        );
    }
}

function randomPart(): string {
    try {
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }
    } catch {
        // fallback abaixo
    }

    return [
        Date.now(),
        Math.random().toString(16).slice(2),
        Math.random().toString(16).slice(2),
    ].join("-");
}

function cleanRecordPayload(
    payload: Record<string, any>,
): Record<string, any> {
    const record = {
        ...payload,
    };

    delete record.acao;
    delete record.operation_id;
    delete record.origem;
    delete record.usuario_id;
    delete record.device_id;
    delete record.ocorreu_em;
    delete record.device_ocorreu_em;
    delete record.clock_offset_ms;
    delete record._wizard_restrict_ids;
    delete record._wizard_modal_restrict_ids;
    delete record._wizard_modal_scope;

    return record;
}

export function isLocalAttendanceId(
    value: unknown,
): boolean {
    return String(value ?? "").startsWith(
        LOCAL_ATTENDANCE_PREFIX,
    );
}

export function createLocalAttendance(input: {
    payload: Record<string, any>;
    userId: string;
    userName: string;
    operationId: string;
}): LocalAttendanceEntry {
    const existing = readAll().find(
        (row) =>
            row.operationId === input.operationId &&
            row.userId === String(input.userId),
    );

    if (existing) {
        return existing;
    }

    const localId =
        `${LOCAL_ATTENDANCE_PREFIX}${randomPart()}`;

    const now = Date.now();

    const record: Record<string, any> = {
        ...cleanRecordPayload(input.payload),
        id: localId,
        status: "fase00",
        agente: input.userName,
        __localOnly: true,
        __localOwnerUserId: String(input.userId),
        __syncStatus: "pending",
        __pendingCount: 1,
        __localCreatedAt: now,
    };

    const entry: LocalAttendanceEntry = {
        localId,
        userId: String(input.userId),
        userName: String(input.userName || ""),
        operationId: input.operationId,
        createdAt: now,
        updatedAt: now,
        record,
    };

    const rows = readAll();
    rows.push(entry);
    writeAll(rows);

    return entry;
}

export function getLocalAttendance(
    localId: string,
): LocalAttendanceEntry | null {
    return (
        readAll().find(
            (row) => row.localId === String(localId),
        ) ?? null
    );
}

export function getLocalAttendancesForUser(
    userId: string,
): LocalAttendanceEntry[] {
    const uid = String(userId);

    return readAll()
        .filter(
            (row) => String(row.userId) === uid,
        )
        .sort(
            (a, b) =>
                Number(b.updatedAt ?? 0) -
                Number(a.updatedAt ?? 0),
        );
}

export function mergeLocalAttendancesWithRecords<
    T extends Record<string, any>,
>(
    records: T[],
    userId: string,
): T[] {
    const locals =
        getLocalAttendancesForUser(userId);

    if (!locals.length) {
        return records;
    }

    /*
     * Se a criação já recebeu um serverId, mas a fase01 ainda está
     * sendo finalizada, escondemos temporariamente a versão do servidor.
     * Assim a tela não mostra o mesmo atendimento duas vezes.
     */
    const serverIdsHidden =
        new Set(
            locals
                .map((row) => String(row.serverId || ""))
                .filter(Boolean),
        );

    const serverRows =
        (records || []).filter((row) => {
            const id = String(
                row?.id ??
                row?.sepultamento_id ??
                "",
            );

            return !serverIdsHidden.has(id);
        });

    const localRows =
        locals.map(
            (row) => ({
                ...(row.record as any),
                id: row.localId,
                __localOnly: true,
                __localOwnerUserId: row.userId,
                __syncStatus: "pending",
                __pendingCount:
                    row.phase01?.status === "pending"
                        ? 2
                        : 1,
                __serverIdPending:
                    row.serverId || undefined,
            }),
        ) as T[];

    return [
        ...localRows,
        ...serverRows,
    ];
}

export function markLocalAttendancePhase01(
    localId: string,
    phase: Omit<
        LocalAttendancePhase01,
        "status"
    >,
): LocalAttendanceEntry {
    const rows = readAll();
    const index = rows.findIndex(
        (row) => row.localId === String(localId),
    );

    if (index < 0) {
        throw new Error(
            "Atendimento local não encontrado.",
        );
    }

    const current = rows[index];

    const next: LocalAttendanceEntry = {
        ...current,
        updatedAt: Date.now(),
        phase01: {
            ...phase,
            status: "pending",
        },
        record: {
            ...current.record,
            id: current.localId,
            status: "fase01",
            agente:
                phase.userName ||
                current.userName,
            __localOnly: true,
            __localOwnerUserId:
                current.userId,
            __syncStatus: "pending",
            __pendingCount: 2,
            __lastOfflineOccurredAt:
                phase.occurredAt,
        },
    };

    rows[index] = next;
    writeAll(rows);

    return next;
}

export function setLocalAttendanceServerId(
    localId: string,
    serverId: string | number,
): LocalAttendanceEntry | null {
    const rows = readAll();
    const index = rows.findIndex(
        (row) => row.localId === String(localId),
    );

    if (index < 0) {
        return null;
    }

    const next: LocalAttendanceEntry = {
        ...rows[index],
        serverId: String(serverId),
        updatedAt: Date.now(),
    };

    rows[index] = next;
    writeAll(rows);

    return next;
}

export function markLocalAttendancePhase01Synced(
    localId: string,
): LocalAttendanceEntry | null {
    const rows = readAll();
    const index = rows.findIndex(
        (row) => row.localId === String(localId),
    );

    if (index < 0) {
        return null;
    }

    const current = rows[index];

    if (!current.phase01) {
        return current;
    }

    const next: LocalAttendanceEntry = {
        ...current,
        updatedAt: Date.now(),
        phase01: {
            ...current.phase01,
            status: "synced",
            syncedAt: new Date().toISOString(),
        },
    };

    rows[index] = next;
    writeAll(rows);

    return next;
}

export function removeLocalAttendance(
    localId: string,
): void {
    const next = readAll().filter(
        (row) => row.localId !== String(localId),
    );

    writeAll(next);
}