import { payloadRestrictIds, scopeTemAlgum } from "./escopo";
import { normalizarRotasAtendimentoPayload } from "./regras-destino";
import {
  normalizarMetadadosVazios,
  validarMetasItens,
} from "./regras-itens";
import { normalizarValidarVelorio } from "./regras-velorio";
import { validarObrigatoriosFase02 } from "./regras-atendimento";
import {
  CoroaRepository,
  normalizarValidarCoroaPayload,
} from "./regras-coroas";

const CAMPOS_ITENS = [
  "urna",
  "roupa",
  "assistencia",
  "tanato",
  "ornamentacao",
  "ornamentacao_tipo",
  "invol",
  "invol_item",
  "veu",
  "veu_item",
  "cordao",
  "cordao_item",
  "kit_lanche",
  "coroa_flores",
  "coroa_tipo",
  "coroa_modelo",
  "arrumacao",
];

const CAMPOS_VELORIO = [
  "local_velorio",
  "sala_velorio",
  "velorio_online",
];

export async function aplicarRegrasAtendimento<
  T extends Record<string, any>,
>(
  payload: T,
  obrigatoriedadeAtiva: boolean,
  coroaRepo: CoroaRepository,
): Promise<T> {
  let json = normalizarMetadadosVazios(payload);
  const scopeIds = payloadRestrictIds(json);

  json = normalizarRotasAtendimentoPayload(json);

  json = await normalizarValidarCoroaPayload(
    json,
    obrigatoriedadeAtiva,
    scopeIds,
    coroaRepo,
  );

  if (scopeTemAlgum(scopeIds, CAMPOS_VELORIO)) {
    json = normalizarValidarVelorio(
      json,
      obrigatoriedadeAtiva,
    );
  }

  if (obrigatoriedadeAtiva) {
    validarObrigatoriosFase02(json, scopeIds);

    if (scopeTemAlgum(scopeIds, CAMPOS_ITENS)) {
      validarMetasItens(json);
    }
  }

  return json;
}
