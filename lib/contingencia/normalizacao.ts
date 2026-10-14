export function semAcentos(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function chaveNormalizada(value: unknown): string {
  return semAcentos(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function textoCanonico(value: unknown): string {
  return semAcentos(value)
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function simNaoCanonico(value: unknown): "Sim" | "Não" | "" {
  const key = chaveNormalizada(value);

  if (["sim", "s", "1", "true"].includes(key)) return "Sim";
  if (["nao", "n", "0", "false"].includes(key)) return "Não";
  return "";
}

export function isSim(value: unknown): boolean {
  return simNaoCanonico(value) === "Sim";
}

export function isNao(value: unknown): boolean {
  return simNaoCanonico(value) === "Não";
}

export function isTrue(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;

  return ["true", "sim", "s", "yes", "y"].includes(
    chaveNormalizada(value),
  );
}

export function asNullIfEmpty<T>(value: T): T | null {
  if (value === null || value === undefined) return null;
  return String(value).trim() === "" ? null : value;
}

export function normUpper(value: unknown): string {
  return textoCanonico(value);
}

export function isRoupaPropria(value: unknown): boolean {
  return chaveNormalizada(value) === "roupa propria";
}
