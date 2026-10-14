import { chaveNormalizada } from "./normalizacao";
import { RegraNegocioError } from "./erro-regra";

export function normalizarValidarVelorio<
  T extends Record<string, any>,
>(
  payload: T,
  exigirOnline = true,
): T {
  const json: Record<string, any> = { ...payload };

  const temSala = Object.prototype.hasOwnProperty.call(
    json,
    "sala_velorio",
  );

  const temOnline = Object.prototype.hasOwnProperty.call(
    json,
    "velorio_online",
  );

  if (!temSala && !temOnline) {
    return json as T;
  }

  const salaRaw = String(json.sala_velorio ?? "").trim();
  const onlineRaw = String(
    json.velorio_online ?? "",
  ).trim();

  if (salaRaw === "") {
    json.sala_velorio = null;
    json.velorio_online = null;
    return json as T;
  }

  const salaKey = chaveNormalizada(salaRaw)
    .replace("sala-", "sala ")
    .replace("sala_", "sala ")
    .replace(/\s+/g, " ");

  const salaMap: Record<string, string> = {
    "sala 1": "Sala 01",
    "sala 01": "Sala 01",
    "01": "Sala 01",
    "1": "Sala 01",
    "sala 2": "Sala 02",
    "sala 02": "Sala 02",
    "02": "Sala 02",
    "2": "Sala 02",
    "sala 3": "Sala 03",
    "sala 03": "Sala 03",
    "03": "Sala 03",
    "3": "Sala 03",
  };

  if (!salaMap[salaKey]) {
    throw new RegraNegocioError(
      "Sala do velório inválida. Escolha Sala 01, Sala 02 ou Sala 03.",
    );
  }

  json.sala_velorio = salaMap[salaKey];

  const onlineKey = chaveNormalizada(onlineRaw);

  if (["sim", "s", "1", "true"].includes(onlineKey)) {
    json.velorio_online = "Sim";
    return json as T;
  }

  if (["nao", "n", "0", "false"].includes(onlineKey)) {
    json.velorio_online = "Não";
    return json as T;
  }

  if (!exigirOnline) {
    json.velorio_online = null;
    return json as T;
  }

  throw new RegraNegocioError(
    "Informe se o velório será transmitido online.",
  );
}
