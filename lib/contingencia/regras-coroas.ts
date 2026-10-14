import { scopeTemAlgum } from "./escopo";
import {
  asNullIfEmpty,
  chaveNormalizada,
  isSim,
  normUpper,
  simNaoCanonico,
} from "./normalizacao";
import { RegraNegocioError } from "./erro-regra";

export type ProdutoCoroa = {
  id: number;
  nome: string;
  codigo_barras?: string | null;
  valor?: number | string | null;
  foto_url?: string | null;
  ativo?: boolean | number | null;
  categoria_nome?: string | null;
};

export type DepositoCoroa = {
  id: number;
  nome: string;
};

export interface CoroaRepository {
  buscarProduto(id: number): Promise<ProdutoCoroa | null>;
  buscarDeposito(
    nomeNormalizado: string,
  ): Promise<DepositoCoroa | null>;
  buscarSaldo(
    produtoId: number,
    depositoId: number,
  ): Promise<number>;
}

const CAMPOS_COROA = [
  "coroa_flores",
  "coroas_itens",
  "coroa_tipo",
  "coroa_produto_id",
  "coroa_modelo",
  "coroa_codigo_barras",
  "coroa_deposito_nome",
];

export async function normalizarValidarCoroaPayload<
  T extends Record<string, any>,
>(
  payload: T,
  obrigatoriedadeAtiva: boolean,
  scopeIds: string[] | null,
  repo: CoroaRepository,
): Promise<T> {
  const json: Record<string, any> = { ...payload };

  if (!scopeTemAlgum(scopeIds, CAMPOS_COROA)) {
    return json as T;
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      json,
      "coroa_flores",
    )
  ) {
    return json as T;
  }

  json.coroa_flores = simNaoCanonico(
    json.coroa_flores,
  );

  if (!isSim(json.coroa_flores)) {
    json.coroa_tipo = null;
    json.coroa_produto_id = null;
    json.coroa_modelo = null;
    json.coroa_codigo_barras = null;
    json.coroa_deposito_nome = null;
    json.coroas_itens = [];
    return json as T;
  }

  const rawItens = json.coroas_itens;

  if (!Array.isArray(rawItens) || rawItens.length === 0) {
    const tipo = chaveNormalizada(json.coroa_tipo);
    const produtoId = Number(
      json.coroa_produto_id ?? 0,
    );
    const modelo = String(
      json.coroa_modelo ?? "",
    ).trim();

    if (
      obrigatoriedadeAtiva &&
      (!["natural", "artificial"].includes(tipo) ||
        produtoId <= 0 ||
        modelo === "")
    ) {
      throw new RegraNegocioError(
        "Coroa de Flores: informe quantidade, tipo, modelo e frase de cada coroa.",
      );
    }

    if (tipo === "artificial") {
      const dep = normUpper(
        json.coroa_deposito_nome,
      );

      if (
        dep !== "" &&
        !["MEMORIAL", "FUNERARIA"].includes(dep)
      ) {
        throw new RegraNegocioError(
          "Coroa Artificial: depósitos permitidos são MEMORIAL e FUNERARIA.",
        );
      }
    }

    if (
      produtoId > 0 &&
      String(
        json.coroa_codigo_barras ?? "",
      ).trim() === ""
    ) {
      const produto =
        await repo.buscarProduto(produtoId);

      const cb = String(
        produto?.codigo_barras ?? "",
      ).trim();

      if (cb) {
        json.coroa_codigo_barras = cb;
      }
    }

    return json as T;
  }

  if (rawItens.length > 20) {
    throw new RegraNegocioError(
      "Coroa de Flores: informe de 1 a 20 coroas.",
    );
  }

  const normalizados: Record<string, any>[] = [];

  const produtoCache =
    new Map<number, ProdutoCoroa | null>();

  const depositoCache =
    new Map<string, DepositoCoroa | null>();

  const necessario = new Map<
    string,
    {
      produto_id: number;
      deposito_id: number;
      deposito_nome: string;
      modelo: string;
      quantidade: number;
    }
  >();

  for (
    let index = 0;
    index < rawItens.length;
    index++
  ) {
    const item = rawItens[index];

    if (!item || typeof item !== "object") {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: item inválido.`,
      );
    }

    const tipo = chaveNormalizada(
      item.tipo_coroa,
    );

    if (
      !["natural", "artificial"].includes(tipo)
    ) {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: selecione Natural ou Artificial.`,
      );
    }

    const produtoId = Number(
      item.produto_id ?? 0,
    );

    const frase = String(
      item.frase ?? "",
    ).trim();

    if (produtoId <= 0) {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: selecione o modelo.`,
      );
    }

    if (!frase) {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: preencha a frase.`,
      );
    }

    if (!produtoCache.has(produtoId)) {
      produtoCache.set(
        produtoId,
        await repo.buscarProduto(produtoId),
      );
    }

    const produto =
      produtoCache.get(produtoId) ?? null;

    if (
      !produto ||
      !(
        produto.ativo === true ||
        Number(produto.ativo ?? 0) === 1
      )
    ) {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: modelo indisponível.`,
      );
    }

    const categoria = chaveNormalizada(
      produto.categoria_nome,
    );

    const esperada =
      tipo === "natural"
        ? chaveNormalizada("COROAS NATURAIS")
        : chaveNormalizada("COROAS ARTIFICIAIS");

    if (categoria !== esperada) {
      throw new RegraNegocioError(
        `Coroa ${index + 1}: o modelo não pertence ao tipo selecionado.`,
      );
    }

    let depositoNome: string | null = null;

    if (tipo === "artificial") {
      const dep = normUpper(
        item.deposito_nome,
      );

      if (
        !["MEMORIAL", "FUNERARIA"].includes(dep)
      ) {
        throw new RegraNegocioError(
          `Coroa ${index + 1}: selecione MEMORIAL ou FUNERARIA.`,
        );
      }

      if (!depositoCache.has(dep)) {
        depositoCache.set(
          dep,
          await repo.buscarDeposito(dep),
        );
      }

      const deposito =
        depositoCache.get(dep) ?? null;

      if (!deposito || Number(deposito.id) <= 0) {
        throw new RegraNegocioError(
          `Coroa ${index + 1}: depósito não cadastrado no estoque.`,
        );
      }

      depositoNome = normUpper(
        deposito.nome,
      );

      const key =
        `${produtoId}|${deposito.id}`;

      const atual = necessario.get(key) ?? {
        produto_id: produtoId,
        deposito_id: Number(deposito.id),
        deposito_nome: depositoNome,
        modelo: String(produto.nome ?? ""),
        quantidade: 0,
      };

      atual.quantidade++;
      necessario.set(key, atual);
    }

    normalizados.push({
      ordem: index + 1,
      tipo_coroa: tipo,
      produto_id: produtoId,
      modelo_coroa: String(
        produto.nome ?? "",
      ).trim(),
      codigo_barras: String(
        produto.codigo_barras ?? "",
      ).trim(),
      deposito_nome: depositoNome,
      frase,
      valor: Math.max(
        0,
        Number(produto.valor ?? 0),
      ),
      foto_produto_url:
        String(
          produto.foto_url ?? "",
        ).trim() || null,
    });
  }

  for (const item of necessario.values()) {
    const disponivel =
      await repo.buscarSaldo(
        item.produto_id,
        item.deposito_id,
      );

    if (disponivel < item.quantidade) {
      throw new RegraNegocioError(
        `Coroa Artificial ${item.modelo}: saldo insuficiente em ${item.deposito_nome}. Disponível: ${disponivel}; solicitado: ${item.quantidade}.`,
        409,
      );
    }
  }

  json.coroas_itens = normalizados;

  const primeiro =
    normalizados[0] ?? null;

  json.coroa_tipo =
    primeiro?.tipo_coroa === "artificial"
      ? "Artificial"
      : "Natural";

  json.coroa_produto_id = Number(
    primeiro?.produto_id ?? 0,
  );

  json.coroa_modelo = String(
    primeiro?.modelo_coroa ?? "",
  );

  if (
    normalizados.length > 1 &&
    json.coroa_modelo !== ""
  ) {
    json.coroa_modelo +=
      ` +${normalizados.length - 1}`;
  }

  json.coroa_codigo_barras =
    asNullIfEmpty(
      primeiro?.codigo_barras ?? null,
    );

  json.coroa_deposito_nome =
    asNullIfEmpty(
      primeiro?.deposito_nome ?? null,
    );

  return json as T;
}
