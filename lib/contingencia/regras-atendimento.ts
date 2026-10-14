import { campoNoEscopo } from "./escopo";
import { chaveNormalizada } from "./normalizacao";
import { RegraNegocioError } from "./erro-regra";

export function normalizeStatusCode(status: unknown): string | null {
  if (!status) return null;

  let s = String(status).trim().toLowerCase();

  if (/^fase\d+$/i.test(s)) {
    const n = s.replace(/\D+/g, "");
    return `fase${n.padStart(2, "0")}`;
  }

  s = chaveNormalizada(s);

  const map: Record<string, string> = {
    removendo: "fase01",
    "aguardando procedimento": "fase02",
    preparando: "fase03",
    "aguardando ornamentacao": "fase04",
    ornamentando: "fase05",
    "fim da ornamentacao": "fase06",
    "aguardando corpo pronto": "fase06",
    "corpo pronto": "fase12",
    transportando: "fase07",
    "transportando obito p/velorio": "fase07",
    "transportando obito para velorio": "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "sepultamento concluido": "fase10",
    "material recolhido": "fase11",
  };

  return map[s] ?? null;
}

export function numeroFaseStatus(status: unknown): number {
  const code = normalizeStatusCode(status) ?? "";
  const match = code.match(/^fase(\d+)$/i);
  return match ? Number(match[1]) || 0 : 0;
}

export function obrigatoriedadeAtivaPorStatus(
  status: unknown,
): boolean {
  return numeroFaseStatus(status) >= 2;
}

export function payloadTipoTerceiro(
  payload: Record<string, any>,
): boolean {
  return (
    String(payload.tipo_atendimento ?? "")
      .trim()
      .toLowerCase() === "terceiro"
  );
}

export function payloadCampoVazio(
  payload: Record<string, any>,
  campo: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(payload, campo)) {
    return true;
  }

  return String(payload[campo] ?? "").trim() === "";
}

export function payloadSimNaoValido(value: unknown): boolean {
  const s = chaveNormalizada(value);
  return [
    "sim",
    "nao",
    "s",
    "n",
    "1",
    "0",
    "true",
    "false",
  ].includes(s);
}

export function asDateOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === false) {
    return null;
  }

  const v = String(value).trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    )
      ? v
      : null;
  }

  const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));

  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(
    2,
    "0",
  )}-${String(d).padStart(2, "0")}`;
}

export function validarObrigatoriosFase02(
  payload: Record<string, any>,
  scopeIds: string[] | null = null,
): void {
  if (payloadTipoTerceiro(payload)) return;

  const obrigatorios: Record<string, string> = {
    falecido: "Nome do Falecido(a)",
    data_nascimento: "Data de Nascimento",
    data_falecimento: "Data de Falecimento",
    nome_responsavel: "Nome do Responsável",
    contato: "Contato",
    convenio: "Convênio",
    religiao: "Religião",
  };

  for (const [campo, label] of Object.entries(obrigatorios)) {
    if (!campoNoEscopo(scopeIds, campo)) continue;

    if (payloadCampoVazio(payload, campo)) {
      throw new RegraNegocioError(
        `Campo obrigatório após Corpo na Clínica: ${label}.`,
      );
    }
  }

  if (
    campoNoEscopo(scopeIds, "data_nascimento") &&
    asDateOrNull(payload.data_nascimento) === null
  ) {
    throw new RegraNegocioError(
      "Data de Nascimento inválida ou não informada.",
    );
  }

  if (
    campoNoEscopo(scopeIds, "data_falecimento") &&
    asDateOrNull(payload.data_falecimento) === null
  ) {
    throw new RegraNegocioError(
      "Data de Falecimento inválida ou não informada.",
    );
  }

  const simNao: Record<string, string> = {
    assistencia: "Assistência",
    tanato: "Tanatopraxia",
    ornamentacao: "Ornamentação",
    invol: "Invol",
    veu: "Véu",
    cordao: "Cordão São Francisco",
    kit_lanche: "KIT LANCHE",
    coroa_flores: "Coroa de Flores",
    realiza_velorio: "Velório",
    realiza_sepultamento: "Sepultamento",
  };

  for (const [campo, label] of Object.entries(simNao)) {
    if (!campoNoEscopo(scopeIds, campo)) continue;

    if (
      payloadCampoVazio(payload, campo) ||
      !payloadSimNaoValido(payload[campo])
    ) {
      throw new RegraNegocioError(
        `Selecione Sim ou Não em ${label}.`,
      );
    }
  }
}
