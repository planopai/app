"use client";

/**
 * lib/offline/storage.ts (16/11/2026)
 *
 * Pede ao navegador para NÃO apagar sozinho os dados do PAI (fila offline, fotos,
 * assinaturas e a lista de atendimentos guardada). Sem isso, o navegador pode
 * limpar o IndexedDB quando o aparelho fica sem espaço, e o iPhone limpa dados de
 * sites pouco usados.
 *
 * navigator.storage.persist() pode responder false (o navegador decide). Não é erro:
 * o PAI continua funcionando, só fica sem a garantia.
 */

export type EstadoArmazenamento = {
  suportado: boolean;
  persistente: boolean | null;
  usadoBytes: number | null;
  cotaBytes: number | null;
  livreBytes: number | null;
};

/** Abaixo disso o aparelho pode não conseguir guardar fotos de Entrega de Corpo. */
export const ESPACO_MINIMO_BYTES = 50 * 1024 * 1024;

let pedidoFeito = false;

export async function pedirArmazenamentoPersistente(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage) return null;
  try {
    if (typeof navigator.storage.persisted === "function" && (await navigator.storage.persisted())) {
      return true;
    }
    if (pedidoFeito || typeof navigator.storage.persist !== "function") return false;
    pedidoFeito = true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function lerArmazenamento(): Promise<EstadoArmazenamento> {
  const vazio: EstadoArmazenamento = {
    suportado: false,
    persistente: null,
    usadoBytes: null,
    cotaBytes: null,
    livreBytes: null,
  };
  if (typeof navigator === "undefined" || !navigator.storage) return vazio;

  const estado: EstadoArmazenamento = { ...vazio, suportado: true };

  try {
    if (typeof navigator.storage.persisted === "function") {
      estado.persistente = await navigator.storage.persisted();
    }
  } catch {
    // Mantém null.
  }

  try {
    if (typeof navigator.storage.estimate === "function") {
      const est = await navigator.storage.estimate();
      const usado = Number(est.usage ?? NaN);
      const cota = Number(est.quota ?? NaN);
      if (Number.isFinite(usado)) estado.usadoBytes = usado;
      if (Number.isFinite(cota) && cota > 0) estado.cotaBytes = cota;
      if (estado.usadoBytes != null && estado.cotaBytes != null) {
        estado.livreBytes = Math.max(0, estado.cotaBytes - estado.usadoBytes);
      }
    }
  } catch {
    // Mantém null.
  }

  return estado;
}

export function formatarBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1).replace(".", ",")} GB`;
}
