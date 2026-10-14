import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { validarPaiSession } from "@/lib/pai-session";

import {
  numeroFaseStatus,
  obrigatoriedadeAtivaPorStatus,
  payloadTipoTerceiro,
} from "@/lib/contingencia/regras-atendimento";
import { aplicarRegrasAtendimento } from "@/lib/contingencia/pipeline-atendimento";
import { RegraNegocioError } from "@/lib/contingencia/erro-regra";
import { coroaRepositorySupabase } from "@/lib/contingencia/coroa-repository-supabase";

const CARGOS_GESTAO = [
  "adm",
  "admin",
  "administrador",
  "gestao",
  "gestão",
];

function depositoInsumosPorUsuarioId(usuarioId: number): string | null {
  if (usuarioId === 7) return "ARMARIO SANDRO";
  if (usuarioId === 16) return "ARMARIO ILDO";
  return null;
}

function podeConservacao(usuarioId: number, cargo: string): boolean {
  return (
    (usuarioId === 7 || usuarioId === 16) &&
    cargo.trim().toLowerCase() === "tanatopraxista"
  );
}

async function podeAlterarItensTravados(
  usuarioId: number,
  cargoSlug: string,
  cargoId: number,
): Promise<boolean> {
  const cargoNormalizado = cargoSlug.trim().toLowerCase();

  if (CARGOS_GESTAO.includes(cargoNormalizado)) {
    return true;
  }

  const { data: permissaoUsuario, error: permissaoUsuarioError } =
    await supabase
      .schema("pai")
      .from("permissoes")
      .select("id")
      .eq("user_id", usuarioId)
      .eq("pagina", "gestao")
      .limit(1)
      .maybeSingle();

  if (!permissaoUsuarioError && permissaoUsuario) {
    return true;
  }

  const { data: permissaoCargo, error: permissaoCargoError } =
    await supabase
      .schema("pai")
      .from("cargo_paginas")
      .select("pagina")
      .eq("cargo_id", cargoId)
      .eq("pagina", "gestao")
      .limit(1)
      .maybeSingle();

  if (!permissaoCargoError && permissaoCargo) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);

  if (!sessao) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Sessão inválida ou expirada",
      },
      { status: 401 },
    );
  }

  const { data: usuario, error: usuarioError } = await supabase
    .schema("pai")
    .from("usuarios")
    .select("id, nome, usuario, cargo")
    .eq("usuario", sessao.usuario)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Erro ao localizar usuário",
      },
      { status: 500 },
    );
  }

  if (!usuario) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Usuário não encontrado",
      },
      { status: 403 },
    );
  }

  const { data: cargo, error: cargoError } = await supabase
    .schema("pai")
    .from("cargos")
    .select("id, nome, slug, ativo")
    .eq("slug", usuario.cargo)
    .eq("ativo", true)
    .maybeSingle();

  if (cargoError) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Erro ao verificar cargo",
      },
      { status: 500 },
    );
  }

  if (!cargo) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Cargo inválido ou inativo",
      },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);

  /*
   * Equivalente ao:
   * informativo.php?me=1
   */
  if (searchParams.has("me")) {
    const usuarioId = Number(usuario.id);

    const podeAlterar = await podeAlterarItensTravados(
      usuarioId,
      String(usuario.cargo ?? ""),
      Number(cargo.id),
    );

    return NextResponse.json({
      sucesso: true,
      id: usuarioId,
      usuario: String(usuario.usuario ?? ""),
      nome: String(usuario.nome ?? ""),
      cargo: String(usuario.cargo ?? ""),
      deposito_insumos: depositoInsumosPorUsuarioId(usuarioId),
      pode_conservacao: podeConservacao(
        usuarioId,
        String(usuario.cargo ?? ""),
      ),
      pode_alterar_itens_travados: podeAlterar,
      server_time: new Date().toISOString(),
      server_time_unix_ms: Date.now(),
      modo: "contingencia",
    });
  }

  const { data: permissao, error: permissaoError } = await supabase
    .schema("pai")
    .from("cargo_paginas")
    .select("pagina")
    .eq("cargo_id", cargo.id)
    .eq("pagina", "atendimento")
    .maybeSingle();

  if (permissaoError) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Erro ao verificar permissão",
      },
      { status: 500 },
    );
  }

  if (!permissao) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Usuário sem permissão para atendimento",
      },
      { status: 403 },
    );
  }

  const recurso = searchParams.get("recurso");

  if (
    recurso !== "os_ordens" &&
    recurso !== "sepultamentos"
  ) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Recurso não suportado",
      },
      { status: 400 },
    );
  }

  const tabela =
    recurso === "sepultamentos"
      ? "sepultamentos"
      : "os_ordens";

  let query = supabase
    .schema("pai")
    .from(tabela)
    .select("*")
    .order("id", { ascending: false });

  if (recurso === "sepultamentos") {
    query = query
      .or(
        "material_recolhido.eq.false,material_recolhido.is.null",
      )
      .is("cancelado_em", null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        erro: error.message,
      },
      { status: 500 },
    );
  }

  let dados = data ?? [];

  if (
    recurso === "sepultamentos" &&
    dados.length > 0
  ) {
    const ids = dados
      .map((registro: any) => Number(registro.id))
      .filter((id: number) => id > 0);

    const { data: homenagens, error: homenagensError } =
      await supabase
        .schema("pai")
        .from("homenagens")
        .select(
          "id, atendimento_id, atendimento_tabela, slug, link_publico, status",
        )
        .in("atendimento_id", ids)
        .eq("atendimento_tabela", "sepultamentos")
        .order("atendimento_id", { ascending: true })
        .order("id", { ascending: false });

    if (homenagensError) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Erro ao carregar homenagens",
        },
        { status: 500 },
      );
    }

    const homenagensPorAtendimento = new Map<number, any>();

    for (const homenagem of homenagens ?? []) {
      const atendimentoId = Number(homenagem.atendimento_id);

      if (
        atendimentoId > 0 &&
        !homenagensPorAtendimento.has(atendimentoId)
      ) {
        homenagensPorAtendimento.set(atendimentoId, homenagem);
      }
    }

    dados = dados.map((registro: any) => {
      const atendimentoId = Number(registro.id);
      const homenagem =
        homenagensPorAtendimento.get(atendimentoId);

      const slug = String(
        homenagem?.slug ?? "",
      ).trim();

      const linkPublico =
        atendimentoId > 0
          ? `https://planoassistencialintegrado.com.br/legado-de-luz/?atendimento_id=${encodeURIComponent(
              String(atendimentoId),
            )}`
          : "";

      return {
        ...registro,
        homenagem_slug: slug,
        codigo_homenagem: slug,
        legado_luz_slug: slug,
        homenagem_link_publico: linkPublico,
        legado_luz_link: linkPublico,
        legado_luz_atendimento_id:
          atendimentoId > 0
            ? String(atendimentoId)
            : "",
        homenagem_status: String(
          homenagem?.status ?? "",
        ),
      };
    });
  }

  return NextResponse.json({
    ok: true,
    modo: "contingencia",
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      usuario: usuario.usuario,
      cargo: usuario.cargo,
    },
    permissao: "atendimento",
    recurso,
    dados,
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);

  if (!sessao) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Sessão inválida ou expirada",
      },
      { status: 401 },
    );
  }

  const { data: usuario, error: usuarioError } = await supabase
    .schema("pai")
    .from("usuarios")
    .select("id, nome, usuario, cargo")
    .eq("usuario", sessao.usuario)
    .maybeSingle();

  if (usuarioError || !usuario) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Usuário autenticado não identificado.",
      },
      { status: 401 },
    );
  }

  const { data: cargo, error: cargoError } = await supabase
    .schema("pai")
    .from("cargos")
    .select("id, slug, ativo")
    .eq("slug", usuario.cargo)
    .eq("ativo", true)
    .maybeSingle();

  if (cargoError || !cargo) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Cargo inválido ou inativo.",
      },
      { status: 403 },
    );
  }

  const { data: permissao, error: permissaoError } = await supabase
    .schema("pai")
    .from("cargo_paginas")
    .select("pagina")
    .eq("cargo_id", cargo.id)
    .eq("pagina", "atendimento")
    .maybeSingle();

  if (permissaoError || !permissao) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Usuário sem permissão para atendimento.",
      },
      { status: 403 },
    );
  }

  const json = await request.json().catch(() => null);

  if (!json || typeof json !== "object") {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Dados inválidos.",
      },
      { status: 400 },
    );
  }

  const acao = String(json.acao ?? "").trim();

  if (acao !== "novo" && acao !== "editar") {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Ação de teste não suportada.",
      },
      { status: 400 },
    );
  }

  let obrigatoriedadeAtiva = false;
  let statusAtual: string | null = null;

  if (acao === "editar") {
    const id = Number(json.id ?? 0);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: true,
          msg: "ID inválido.",
        },
        { status: 400 },
      );
    }

    const { data: registro, error: registroError } = await supabase
      .schema("pai")
      .from("sepultamentos")
      .select("id, status, cancelado_em")
      .eq("id", id)
      .maybeSingle();

    if (registroError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: true,
          msg: "Erro ao localizar atendimento.",
        },
        { status: 500 },
      );
    }

    if (!registro) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: true,
          msg: "Registro não encontrado.",
        },
        { status: 404 },
      );
    }

    if (registro.cancelado_em) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: true,
          codigo: "ATENDIMENTO_CANCELADO",
          msg:
            "Este atendimento foi cancelado. Não é possível alterar nem registrar ações.",
        },
        { status: 409 },
      );
    }

    statusAtual = String(registro.status ?? "");
    obrigatoriedadeAtiva =
      obrigatoriedadeAtivaPorStatus(statusAtual);
  }

  let scopeIds: string[] | null = null;

  if (
    Object.prototype.hasOwnProperty.call(
      json,
      "_wizard_restrict_ids",
    )
  ) {
    let raw = json._wizard_restrict_ids;

    if (typeof raw === "string") {
      const texto = raw.trim();

      if (texto) {
        try {
          const parsed = JSON.parse(texto);

          raw = Array.isArray(parsed)
            ? parsed
            : texto.split(",");
        } catch {
          raw = texto.split(",");
        }
      }
    }

    if (Array.isArray(raw)) {
      const ids = raw
        .map((item: unknown) =>
          String(item ?? "").trim(),
        )
        .filter(Boolean);

      scopeIds = Array.from(new Set(ids));
    }
  }

  try {
    await aplicarRegrasAtendimento(
      json as Record<string, any>,
      obrigatoriedadeAtiva,
      coroaRepositorySupabase,
    );
  } catch (error) {
    if (error instanceof RegraNegocioError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: true,
          ...(error.codigo
            ? { codigo: error.codigo }
            : {}),
          ...(error.detalhes !== undefined
            ? { detalhes: error.detalhes }
            : {}),
          msg: error.message,
        },
        { status: error.status },
      );
    }

    console.error(
      "[contingencia] Falha no pipeline de validação:",
      error,
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        msg: "Falha interna ao validar o atendimento.",
      },
      { status: 500 },
    );
  }

  const gravarContingencia =
    json.gravar_contingencia === true;

  if (!gravarContingencia) {
    return NextResponse.json({
      sucesso: true,
      modo: "contingencia",
      apenas_validacao: true,
      acao,
      atendimento_id:
        acao === "editar"
          ? Number(json.id)
          : null,
      status_atual: statusAtual,
      fase_atual:
        statusAtual !== null
          ? numeroFaseStatus(statusAtual)
          : null,
      obrigatoriedade_ativa:
        obrigatoriedadeAtiva,
      tipo_terceiro:
        payloadTipoTerceiro(json),
      scope_ids: scopeIds,
      msg:
        "Payload validado. Envie gravar_contingencia=true para efetivar a gravação.",
    });
  }

  const fotoFalecido = String(
    json.foto_falecido ?? "",
  ).trim();

  if (fotoFalecido.startsWith("data:")) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        codigo: "FOTO_CONTINGENCIA_PENDENTE",
        msg:
          "A gravação de nova foto em base64 ainda não está habilitada na contingência.",
      },
      { status: 409 },
    );
  }

  if (
    Array.isArray(json.coroas_itens) &&
    json.coroas_itens.length > 0
  ) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        codigo: "COROAS_PERSISTENCIA_PENDENTE",
        msg:
          "Os itens detalhados de coroas ainda não podem ser gravados na contingência.",
      },
      { status: 409 },
    );
  }

  const payloadRpc = {
    ...json,
  };

  delete payloadRpc.usuario_id;

  const { data: resultadoRpc, error: rpcError } =
    await supabase
      .schema("pai")
      .rpc(
        "salvar_atendimento_contingencia",
        {
          p_payload: payloadRpc,
          p_usuario_id: Number(usuario.id),
          p_usuario_nome: String(
            usuario.nome ?? usuario.usuario ?? "",
          ),
        },
      );

  if (rpcError) {
    const mensagem = String(
      rpcError.message ?? "Falha ao gravar atendimento.",
    );

    let status = 500;
    let codigo = "GRAVACAO_CONTINGENCIA";

    if (mensagem.includes("ATENDIMENTO_CANCELADO:")) {
      status = 409;
      codigo = "ATENDIMENTO_CANCELADO";
    } else if (
      mensagem.includes("ITENS_TRAVADOS_CONTINGENCIA:")
    ) {
      status = 409;
      codigo = "ITENS_TRAVADOS";
    } else if (
      mensagem.includes("OPERATION_ID_CONFLITO:")
    ) {
      status = 409;
      codigo = "OPERATION_ID_CONFLITO";
    } else if (
      mensagem.includes("REGISTRO_NAO_ENCONTRADO:")
    ) {
      status = 404;
      codigo = "REGISTRO_NAO_ENCONTRADO";
    } else if (
      mensagem.includes("ID_INVALIDO:") ||
      mensagem.includes("PAYLOAD_INVALIDO:") ||
      mensagem.includes("ACAO_INVALIDA:")
    ) {
      status = 400;
      codigo = "DADOS_INVALIDOS";
    }

    console.error(
      "[contingencia] Erro RPC salvar atendimento:",
      rpcError,
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro: true,
        codigo,
        msg: mensagem.replace(/^[A-Z0-9_]+:\s*/, ""),
      },
      { status },
    );
  }

  return NextResponse.json({
    ...(resultadoRpc && typeof resultadoRpc === "object"
      ? resultadoRpc
      : { sucesso: true }),
    modo: "contingencia",
    gravado: true,
    status_anterior: statusAtual,
    fase_anterior:
      statusAtual !== null
        ? numeroFaseStatus(statusAtual)
        : null,
    obrigatoriedade_ativa:
      obrigatoriedadeAtiva,
    tipo_terceiro:
      payloadTipoTerceiro(json),
    scope_ids: scopeIds,
  });
}
