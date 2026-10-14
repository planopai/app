import {
  isNao,
  simNaoCanonico,
} from "./normalizacao";

export function normalizarRotasAtendimentoPayload<
  T extends Record<string, any>,
>(payload: T): T {
  const json: Record<string, any> = { ...payload };

  if (
    Object.prototype.hasOwnProperty.call(
      json,
      "realiza_velorio",
    )
  ) {
    json.realiza_velorio = simNaoCanonico(
      json.realiza_velorio,
    );

    if (isNao(json.realiza_velorio)) {
      json.local_velorio = "";
      json.sala_velorio = null;
      json.velorio_online = null;
      json.data_inicio_velorio = null;
      json.data_fim_velorio = null;
      json.hora_inicio_velorio = null;
      json.hora_fim_velorio = null;
      json.observacao_velorio01 = "";
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      json,
      "realiza_sepultamento",
    )
  ) {
    json.realiza_sepultamento = simNaoCanonico(
      json.realiza_sepultamento,
    );

    if (isNao(json.realiza_sepultamento)) {
      json.local = "";
      json.observacao_velorio02 = "";
    }
  }

  return json as T;
}
