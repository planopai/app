import {
  isRoupaPropria,
  isSim,
  isTrue,
  normUpper,
} from "./normalizacao";
import { RegraNegocioError } from "./erro-regra";

function validarDeposito(
  campo: string,
  valor: unknown,
  permitidos: string[],
): string {
  const dep = normUpper(valor);

  if (!dep || !permitidos.includes(dep)) {
    throw new RegraNegocioError(
      `Depósito inválido para ${campo}. Permitidos: ${permitidos.join(
        ", ",
      )}.`,
    );
  }

  return dep;
}

export function normalizarMetadadosVazios<
  T extends Record<string, any>,
>(payload: T): T {
  const json: Record<string, any> = { ...payload };

  if (
    Object.prototype.hasOwnProperty.call(json, "urna") &&
    String(json.urna ?? "").trim() === ""
  ) {
    json.urna = "";
    json.urna_deposito_nome = null;
    json.urna_produto_id = null;
    json.urna_codigo_barras = null;
  }

  if (
    Object.prototype.hasOwnProperty.call(json, "roupa") &&
    String(json.roupa ?? "").trim() === ""
  ) {
    json.roupa = "";
    json.roupa_deposito_nome = null;
    json.roupa_produto_id = null;
    json.roupa_codigo_barras = null;
    json.roupa_propria = 0;
  }

  if (isTrue(json.roupa_propria)) {
    json.roupa = "ROUPA PRÓPRIA";
    json.roupa_produto_id = null;
    json.roupa_codigo_barras = null;
    json.roupa_deposito_nome = null;
  }

  return json as T;
}

export function validarMetasItens(
  payload: Record<string, any>,
): void {
  const urnaTxt = String(payload.urna ?? "").trim();
  const urnaPid = Number(payload.urna_produto_id ?? 0);

  if (urnaTxt !== "" && urnaPid <= 0) {
    throw new RegraNegocioError(
      "Selecione uma urna da lista (produto do estoque).",
    );
  }

  const roupaTxt = String(payload.roupa ?? "").trim();
  const roupaPropria = isTrue(payload.roupa_propria);

  if (
    !roupaPropria &&
    roupaTxt !== "" &&
    !isRoupaPropria(roupaTxt)
  ) {
    const pid = Number(payload.roupa_produto_id ?? 0);

    if (pid <= 0) {
      throw new RegraNegocioError(
        "Selecione uma roupa da lista (produto do estoque) ou marque ROUPA PRÓPRIA.",
      );
    }

    validarDeposito(
      "ROUPA",
      payload.roupa_deposito_nome,
      ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"],
    );
  }

  if (isSim(payload.invol)) {
    if (Number(payload.invol_produto_id ?? 0) <= 0) {
      throw new RegraNegocioError(
        "Selecione um INVOL da lista (produto do estoque).",
      );
    }

    validarDeposito(
      "INVOL",
      payload.invol_deposito_nome,
      ["ARMARIO SANDRO", "ARMARIO ILDO"],
    );
  }

  if (isSim(payload.veu)) {
    if (Number(payload.veu_produto_id ?? 0) <= 0) {
      throw new RegraNegocioError(
        "Selecione um VÉU da lista (produto do estoque).",
      );
    }

    validarDeposito(
      "VÉU",
      payload.veu_deposito_nome,
      ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"],
    );
  }

  if (isSim(payload.cordao)) {
    if (Number(payload.cordao_produto_id ?? 0) <= 0) {
      throw new RegraNegocioError(
        "Selecione um CORDÃO da lista (produto do estoque).",
      );
    }

    validarDeposito(
      "CORDÃO",
      payload.cordao_deposito_nome,
      ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"],
    );
  }

  const rawArr = payload.arrumacao_json;

  let arr: any = null;

  if (
    typeof rawArr === "string" &&
    rawArr.trim() !== ""
  ) {
    try {
      arr = JSON.parse(rawArr);
    } catch {
      arr = null;
    }
  } else if (
    rawArr &&
    typeof rawArr === "object"
  ) {
    arr = rawArr;
  }

  if (arr && typeof arr === "object") {
    const itens = arr.itens ?? arr.items;

    if (Array.isArray(itens) && itens.length > 0) {
      validarDeposito(
        "INSUMOS TANATOPRAXIA",
        arr.deposito_nome ?? arr.deposito,
        ["ARMARIO SANDRO", "ARMARIO ILDO"],
      );

      for (const item of itens) {
        if (!item || typeof item !== "object") continue;
        if (
          Object.prototype.hasOwnProperty.call(item, "checked") &&
          item.checked === false
        ) {
          continue;
        }

        const pid = Number(item.produto_id ?? 0);
        const qtd = Number(
          item.qtd ?? item.quantidade ?? 0,
        );

        if (pid <= 0 || qtd <= 0) {
          throw new RegraNegocioError(
            "Insumos inválidos: informe produto_id e quantidade (>=1).",
          );
        }
      }
    }
  }
}
