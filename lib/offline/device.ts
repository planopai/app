"use client";

import { getMeta, newOfflineId, setMeta } from "./db";

const DEVICE_ID_KEY = "deviceId";

export async function getOfflineDeviceId(): Promise<string> {
  const current = await getMeta<string>(DEVICE_ID_KEY);
  if (current) return current;

  const next = newOfflineId("pai-device");
  await setMeta(DEVICE_ID_KEY, next);
  return next;
}
