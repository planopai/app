export function payloadRestrictIds(
  payload: Record<string, any>,
): string[] | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      payload,
      "_wizard_restrict_ids",
    )
  ) {
    return null;
  }

  let ids: unknown = payload._wizard_restrict_ids;

  if (typeof ids === "string") {
    try {
      const decoded = JSON.parse(ids);
      ids = Array.isArray(decoded) ? decoded : ids.split(",");
    } catch {
      ids = ids.split(",");
    }
  }

  if (!Array.isArray(ids)) return null;

  return Array.from(
    new Set(
      ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export function campoNoEscopo(
  scopeIds: string[] | null,
  campo: string,
): boolean {
  return scopeIds === null || scopeIds.includes(campo);
}

export function scopeTemAlgum(
  scopeIds: string[] | null,
  campos: string[],
): boolean {
  return (
    scopeIds === null ||
    campos.some((campo) => scopeIds.includes(campo))
  );
}
