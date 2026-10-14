import { supabase } from "@/lib/supabase-server";
import type {
  CoroaRepository,
  DepositoCoroa,
  ProdutoCoroa,
} from "./regras-coroas";

function erroBanco(contexto: string, message?: string): Error {
  const detalhe = String(message ?? "").trim();

  return new Error(
    detalhe
      ? `${contexto}: ${detalhe}`
      : contexto,
  );
}

export const coroaRepositorySupabase: CoroaRepository = {
  async buscarProduto(id: number): Promise<ProdutoCoroa | null> {
    const produtoId = Number(id);

    if (!Number.isInteger(produtoId) || produtoId <= 0) {
      return null;
    }

    const { data: produto, error: produtoError } = await supabase
      .schema("pai")
      .from("est_produto")
      .select(
        "id, nome, codigo_barras, valor, foto_url, ativo, categoria_id",
      )
      .eq("id", produtoId)
      .limit(1)
      .maybeSingle();

    if (produtoError) {
      throw erroBanco(
        "Erro ao consultar produto de coroa",
        produtoError.message,
      );
    }

    if (!produto) {
      return null;
    }

    let categoriaNome: string | null = null;
    const categoriaId = Number(produto.categoria_id ?? 0);

    if (categoriaId > 0) {
      const { data: categoria, error: categoriaError } =
        await supabase
          .schema("pai")
          .from("est_categoria")
          .select("nome")
          .eq("id", categoriaId)
          .limit(1)
          .maybeSingle();

      if (categoriaError) {
        throw erroBanco(
          "Erro ao consultar categoria do produto",
          categoriaError.message,
        );
      }

      categoriaNome =
        String(categoria?.nome ?? "").trim() || null;
    }

    return {
      id: Number(produto.id),
      nome: String(produto.nome ?? ""),
      codigo_barras:
        String(produto.codigo_barras ?? "").trim() || null,
      valor: produto.valor ?? null,
      foto_url:
        String(produto.foto_url ?? "").trim() || null,
      ativo: produto.ativo ?? null,
      categoria_nome: categoriaNome,
    };
  },

  async buscarDeposito(
    nomeNormalizado: string,
  ): Promise<DepositoCoroa | null> {
    const nome = String(nomeNormalizado ?? "")
      .trim()
      .toUpperCase();

    if (!nome) {
      return null;
    }

    const { data: deposito, error } = await supabase
      .schema("pai")
      .from("est_deposito")
      .select("id, nome")
      .ilike("nome", nome)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw erroBanco(
        "Erro ao consultar depósito",
        error.message,
      );
    }

    if (!deposito) {
      return null;
    }

    return {
      id: Number(deposito.id),
      nome: String(deposito.nome ?? ""),
    };
  },

  async buscarSaldo(
    produtoId: number,
    depositoId: number,
  ): Promise<number> {
    const pid = Number(produtoId);
    const did = Number(depositoId);

    if (
      !Number.isInteger(pid) ||
      pid <= 0 ||
      !Number.isInteger(did) ||
      did <= 0
    ) {
      return 0;
    }

    const { data: saldo, error } = await supabase
      .schema("pai")
      .from("est_saldo")
      .select("quantidade")
      .eq("produto_id", pid)
      .eq("deposito_id", did)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw erroBanco(
        "Erro ao consultar saldo do produto",
        error.message,
      );
    }

    return Number(saldo?.quantidade ?? 0);
  },
};
