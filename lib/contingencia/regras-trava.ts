import {
  isSim,
  textoCanonico,
} from "./normalizacao";
import { numeroFaseStatus } from "./regras-atendimento";
import { RegraNegocioError } from "./erro-regra";

export const FASE_TRAVA_ITENS = 7;

export const COLUNAS_ITENS_TRAVADOS = [
  "urna",
  "urna_produto_id",
  "urna_deposito_nome",
  "urna_codigo_barras",
  "roupa",
  "roupa_produto_id",
  "roupa_deposito_nome",
  "roupa_codigo_barras",
  "veu",
  "veu_item",
  "veu_produto_id",
  "veu_deposito_nome",
  "veu_codigo_barras",
  "cordao",
  "cordao_item",
  "cordao_produto_id",
  "cordao_deposito_nome",
  "cordao_codigo_barras",
  "invol",
  "invol_item",
  "invol_produto_id",
  "invol_deposito_nome",
  "invol_codigo_barras",
  "tanato",
  "ornamentacao",
  "ornamentacao_tipo",
  "kit_lanche",
  "coroa_flores",
  "coroa_tipo",
  "coroa_produto_id",
  "coroa_modelo",
  "coroa_codigo_barras",
  "coroa_deposito_nome",
  "arrumacao_json",
] as const;

export function registroTemItensTravados(
  row: Record<string, any>,
): boolean {
  if (
    String(row.tipo_atendimento ?? "")
      .trim()
      .toLowerCase() === "terceiro"
  ) {
    return false;
  }

  return numeroFaseStatus(row.status) >= FASE_TRAVA_ITENS;
}

export function registroJaTeveBaixa(
  row: Record<string, any>,
): boolean {
  return numeroFaseStatus(row.status) >= 7;
}

function insumosCanonicos(raw: unknown): string {
  let data: any = raw;

  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }

  if (!data || typeof data !== "object") data = {};

  const lista = data.itens ?? data.items ?? [];
  const mapa = new Map<number, number>();

  if (Array.isArray(lista)) {
    for (const item of lista) {
      if (!item || typeof item !== "object") continue;
      if (
        Object.prototype.hasOwnProperty.call(item, "checked") &&
        item.checked === false
      ) {
        continue;
      }

      const pid = Number(item.produto_id ?? 0);
      const qtd = Number(item.qtd ?? item.quantidade ?? 0);

      if (pid <= 0 || qtd <= 0) continue;

      mapa.set(pid, (mapa.get(pid) ?? 0) + qtd);
    }
  }

  const obj = Object.fromEntries(
    [...mapa.entries()].sort(([a], [b]) => a - b),
  );

  const dep =
    mapa.size > 0
      ? textoCanonico(
          data.deposito_nome ?? data.deposito ?? "",
        )
      : "";

  return JSON.stringify([dep, obj]);
}

export function itensTravadosAlterados(
  row: Record<string, any>,
  payload: Record<string, any>,
): string[] {
  const grupos = [
    ["Urna", "urna", "texto", "urna_produto_id", "urna_deposito_nome", []],
    ["Roupa", "roupa", "texto", "roupa_produto_id", "roupa_deposito_nome", []],
    ["Véu", "veu", "simnao", "veu_produto_id", "veu_deposito_nome", []],
    ["Cordão", "cordao", "simnao", "cordao_produto_id", "cordao_deposito_nome", []],
    ["Invol", "invol", "simnao", "invol_produto_id", "invol_deposito_nome", []],
    ["Tanatopraxia", "tanato", "simnao", null, null, []],
    ["Ornamentação", "ornamentacao", "simnao", null, null, ["ornamentacao_tipo"]],
    ["Kit lanche", "kit_lanche", "simnao", null, null, []],
    ["Coroa de flores", "coroa_flores", "simnao", "coroa_produto_id", "coroa_deposito_nome", ["coroa_tipo"]],
  ] as const;

  const mudou: string[] = [];

  for (const [
    rotulo,
    campo,
    tipo,
    campoId,
    campoDep,
    extras,
  ] of grupos) {
    let temAlgum =
      Object.prototype.hasOwnProperty.call(payload, campo) ||
      (!!campoId &&
        Object.prototype.hasOwnProperty.call(payload, campoId)) ||
      (!!campoDep &&
        Object.prototype.hasOwnProperty.call(payload, campoDep));

    for (const ex of extras) {
      temAlgum =
        temAlgum ||
        Object.prototype.hasOwnProperty.call(payload, ex);
    }

    if (!temAlgum) continue;

    const antes = row[campo] ?? "";
    const depois =
      Object.prototype.hasOwnProperty.call(payload, campo)
        ? payload[campo]
        : antes;

    const ativoAntes =
      tipo === "texto"
        ? textoCanonico(antes) !== ""
        : isSim(antes);

    const ativoDepois =
      tipo === "texto"
        ? textoCanonico(depois) !== ""
        : isSim(depois);

    if (ativoAntes !== ativoDepois) {
      mudou.push(rotulo);
      continue;
    }

    if (!ativoDepois) continue;

    if (
      tipo === "texto" &&
      textoCanonico(antes) !== textoCanonico(depois)
    ) {
      mudou.push(rotulo);
      continue;
    }

    if (
      campoId &&
      Object.prototype.hasOwnProperty.call(payload, campoId)
    ) {
      const idNovo = Number(payload[campoId] ?? 0);

      if (
        idNovo > 0 &&
        idNovo !== Number(row[campoId] ?? 0)
      ) {
        mudou.push(rotulo);
        continue;
      }
    }

    if (
      campoDep &&
      Object.prototype.hasOwnProperty.call(payload, campoDep) &&
      textoCanonico(payload[campoDep]) !==
        textoCanonico(row[campoDep])
    ) {
      mudou.push(rotulo);
      continue;
    }

    let extraMudou = false;

    for (const ex of extras) {
      if (
        Object.prototype.hasOwnProperty.call(payload, ex) &&
        textoCanonico(payload[ex]) !== textoCanonico(row[ex])
      ) {
        extraMudou = true;
        break;
      }
    }

    if (extraMudou) {
      mudou.push(rotulo);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      payload,
      "arrumacao_json",
    ) &&
    insumosCanonicos(payload.arrumacao_json) !==
      insumosCanonicos(row.arrumacao_json)
  ) {
    mudou.push("Insumos da conservação");
  }

  return Array.from(new Set(mudou));
}

export function manterItensTravadosDoRegistro(
  row: Record<string, any>,
  payload: Record<string, any>,
): Record<string, any> {
  const json = { ...payload };

  for (const campo of COLUNAS_ITENS_TRAVADOS) {
    if (Object.prototype.hasOwnProperty.call(row, campo)) {
      json[campo] = row[campo];
    }
  }

  return json;
}

export function validarTravaItensOuErro(
  row: Record<string, any>,
  payload: Record<string, any>,
  podeAlterar: boolean,
): Record<string, any> {
  if (!registroTemItensTravados(row)) return payload;

  const alterados = itensTravadosAlterados(row, payload);

  if (alterados.length > 0 && !podeAlterar) {
    throw new RegraNegocioError(
      `Itens travados após o Corpo Pronto (a baixa no estoque já foi feita). Não é possível alterar: ${alterados.join(
        ", ",
      )}. Só a Gestão pode alterar.`,
      409,
      "ITENS_TRAVADOS",
      { itens: alterados },
    );
  }

  if (alterados.length === 0) {
    return manterItensTravadosDoRegistro(row, payload);
  }

  return payload;
}
