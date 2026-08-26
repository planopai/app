"use client";

import { getCurrentOfflineSession } from "./session";

export type OperationalTimestamp = {
  occurredAt: string;
  deviceOccurredAt: string;
  clockOffsetMs: number;
  timezoneOffsetMinutes: number;
};

export async function getOperationalTimestamp(): Promise<OperationalTimestamp> {
  const session = await getCurrentOfflineSession({
    refreshIfOnline: false,
    allowCachedOnNetworkFailure: true,
  });

  const deviceNow = Date.now();
  const offset = Number(session?.clockOffsetMs ?? 0) || 0;
  const adjustedNow = deviceNow + offset;

  return {
    occurredAt: new Date(adjustedNow).toISOString(),
    deviceOccurredAt: new Date(deviceNow).toISOString(),
    clockOffsetMs: offset,
    timezoneOffsetMinutes: new Date(deviceNow).getTimezoneOffset(),
  };
}
