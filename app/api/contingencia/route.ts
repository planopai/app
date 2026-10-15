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
import {
  removerArquivoContingencia,
  salvarDataUriContingencia,
} from "@/lib/contingencia/storage-contingencia";

const CARGOS_GESTAO = ["adm", "admin", "administrador", "gestao", "gestão"];

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

async function resolverUsuario(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);
  if (!sessao) return { error: "Sessão inválida ou expirada", status: 401 } as const;

  const { data: usuario, error: usuarioError } = await supabase
    .schema("pai")
    .from("usuarios")
    .select("id, nome, usuario, cargo")
    .eq("usuario", sessao.usuario)
    .maybeSingle();

  if (usuarioError || !usuario) {
    return { error: "Usuário autenticado não identificado.", status: 401 } as const;
  }

  const { data: cargo, error: cargoError } = await supabase
    .schema("pai")
    .from("cargos")
    .select("id, nome, slug, ativo")
    .eq("slug", usuario.cargo)
    .eq("ativo", true)
    .maybeSingle();

  if (cargoError || !cargo) {
    return { error: "Cargo inválido ou inativo.", status: 403 } as const;
  }

  return { usuario, cargo } as const;
}

async function temPermissaoAtendimento(usuarioId: number, cargoId: number) {
  const [{ data: direta }, { data: cargo }] = await Promise.all([
    supabase
      .schema("pai")
      .from("permissoes")
      .select("id")
      .eq("user_id", usuarioId)
      .eq("pagina", "atendimento")
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("pai")
      .from("cargo_paginas")
      .select("pagina")
      .eq("cargo_id", cargoId)
      .eq("pagina", "atendimento")
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(direta || cargo);
}

async function podeAlterarItensTravados(usuarioId: number, cargoSlug: string, cargoId: number) {
  const cargoNormalizado = cargoSlug.trim().toLowerCase();
  if (CARGOS_GESTAO.includes(cargoNormalizado)) return true;

  const [{ data: direta }, { data: cargo }] = await Promise.all([
    supabase
      .schema("pai")
      .from("permissoes")
      .select("id")
      .eq("user_id", usuarioId)
      .eq("pagina", "gestao")
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("pai")
      .from("cargo_paginas")
      .select("pagina")
      .eq("cargo_id", cargoId)
      .eq("pagina", "gestao")
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(direta || cargo);
}

function rpcHttpError(message: string) {
  const m = String(message || "");
  const map: Array<[string, number, string]> = [
    ["ATENDIMENTO_CANCELADO:", 409, "ATENDIMENTO_CANCELADO"],
    ["ITENS_TRAVADOS_CONTINGENCIA:", 409, "ITENS_TRAVADOS"],
    ["OPERATION_ID_CONFLITO:", 409, "OPERATION_ID_CONFLITO"],
    ["COROAS_EM_PRODUCAO:", 409, "COROAS_EM_PRODUCAO"],
    ["ESTOQUE_INSUFICIENTE:", 409, "ESTOQUE_INSUFICIENTE"],
    ["CONFLITO_STATUS:", 409, "CONFLITO_STATUS"],
    ["RESPONSAVEL_DIFERENTE:", 409, "RESPONSAVEL_DIFERENTE"],
    ["RESPONSAVEL_AUSENTE:", 409, "RESPONSAVEL_AUSENTE"],
    ["ETAPA_REQUER_ONLINE:", 409, "ETAPA_REQUER_ONLINE"],
    ["REGISTRO_NAO_ENCONTRADO:", 404, "REGISTRO_NAO_ENCONTRADO"],
    ["SEM_PERMISSAO_CONSERVACAO:", 403, "SEM_PERMISSAO_CONSERVACAO"],
    ["FOTO_OBRIGATORIA:", 400, "FOTO_OBRIGATORIA"],
    ["CONFIRMACAO_OBRIGATORIA:", 400, "CONFIRMACAO_OBRIGATORIA"],
    ["COROAS_DADOS_INVALIDOS:", 400, "COROAS_DADOS_INVALIDOS"],
    ["COROAS_MODELO_INDISPONIVEL:", 400, "COROAS_MODELO_INDISPONIVEL"],
    ["COROAS_TIPO_INCOMPATIVEL:", 400, "COROAS_TIPO_INCOMPATIVEL"],
    ["ESTOQUE_DADOS_INVALIDOS:", 400, "ESTOQUE_DADOS_INVALIDOS"],
    ["DADOS_INVALIDOS:", 400, "DADOS_INVALIDOS"],
    ["ID_INVALIDO:", 400, "DADOS_INVALIDOS"],
    ["PAYLOAD_INVALIDO:", 400, "DADOS_INVALIDOS"],
    ["ACAO_INVALIDA:", 400, "DADOS_INVALIDOS"],
  ];

  for (const [prefix, status, codigo] of map) {
    if (m.includes(prefix)) {
      return {
        status,
        codigo,
        msg: m.replace(/^.*?[A-Z0-9_]+:\s*/, ""),
      };
    }
  }

  return { status: 500, codigo: "CONTINGENCIA_RPC", msg: m || "Falha interna." };
}

function jsonError(msg: string, status: number, codigo?: string) {
  return NextResponse.json(
    { sucesso: false, erro: true, ...(codigo ? { codigo } : {}), msg },
    { status },
  );
}

export async function GET(request: NextRequest) {
  const auth = await resolverUsuario(request);
  if ("error" in auth) return jsonError(auth.error, auth.status);

  const { usuario, cargo } = auth;
  const { searchParams } = new URL(request.url);

  if (searchParams.has("me")) {
    const usuarioId = Number(usuario.id);
    return NextResponse.json({
      sucesso: true,
      id: usuarioId,
      usuario: String(usuario.usuario ?? ""),
      nome: String(usuario.nome ?? ""),
      cargo: String(usuario.cargo ?? ""),
      deposito_insumos: depositoInsumosPorUsuarioId(usuarioId),
      pode_conservacao: podeConservacao(usuarioId, String(usuario.cargo ?? "")),
      pode_alterar_itens_travados: await podeAlterarItensTravados(
        usuarioId,
        String(usuario.cargo ?? ""),
        Number(cargo.id),
      ),
      server_time: new Date().toISOString(),
      server_time_unix_ms: Date.now(),
      modo: "contingencia",
    });
  }

  if (!(await temPermissaoAtendimento(Number(usuario.id), Number(cargo.id)))) {
    return jsonError("Usuário sem permissão para atendimento.", 403);
  }

  const recurso = searchParams.get("recurso");
  if (recurso !== "sepultamentos" && recurso !== "os_ordens") {
    return jsonError("Recurso não suportado.", 400);
  }

  const tabela = recurso === "sepultamentos" ? "sepultamentos" : "os_ordens";
  let query = supabase.schema("pai").from(tabela).select("*").order("id", { ascending: false });

  if (recurso === "sepultamentos") {
    query = query.or("material_recolhido.eq.false,material_recolhido.is.null").is("cancelado_em", null);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  let dados: any[] = data ?? [];

  if (recurso === "sepultamentos" && dados.length > 0) {
    const ids = dados.map((r) => Number(r.id)).filter((id) => id > 0);
    const { data: homenagens } = await supabase
      .schema("pai")
      .from("homenagens")
      .select("id, atendimento_id, atendimento_tabela, slug, link_publico, status")
      .in("atendimento_id", ids)
      .eq("atendimento_tabela", "sepultamentos")
      .order("atendimento_id", { ascending: true })
      .order("id", { ascending: false });

    const map = new Map<number, any>();
    for (const h of homenagens ?? []) {
      const id = Number(h.atendimento_id);
      if (id > 0 && !map.has(id)) map.set(id, h);
    }

    dados = dados.map((registro) => {
      const atendimentoId = Number(registro.id);
      const homenagem = map.get(atendimentoId);
      const slug = String(homenagem?.slug ?? "").trim();
      const linkPublico =
        atendimentoId > 0
          ? `https://planoassistencialintegrado.com.br/legado-de-luz/?atendimento_id=${encodeURIComponent(String(atendimentoId))}`
          : "";
      return {
        ...registro,
        homenagem_slug: slug,
        codigo_homenagem: slug,
        legado_luz_slug: slug,
        homenagem_link_publico: linkPublico,
        legado_luz_link: linkPublico,
        legado_luz_atendimento_id: atendimentoId > 0 ? String(atendimentoId) : "",
        homenagem_status: String(homenagem?.status ?? ""),
      };
    });
  }

  return NextResponse.json({
    ok: true,
    modo: "contingencia",
    usuario: { id: usuario.id, nome: usuario.nome, usuario: usuario.usuario, cargo: usuario.cargo },
    recurso,
    dados,
  });
}

export async function POST(request: NextRequest) {
  const auth = await resolverUsuario(request);
  if ("error" in auth) return jsonError(auth.error, auth.status);

  const { usuario, cargo } = auth;
  if (!(await temPermissaoAtendimento(Number(usuario.id), Number(cargo.id)))) {
    return jsonError("Usuário sem permissão para atendimento.", 403);
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return jsonError("Dados inválidos.", 400);
  }

  const payload: Record<string, any> = { ...(json as Record<string, any>) };
  delete payload.usuario_id; // identidade sempre vem da sessão assinada.

  const acao = String(payload.acao ?? "").trim();
  const uid = Number(usuario.id);
  const nome = String(usuario.nome ?? usuario.usuario ?? "");
  const uploadedPaths: string[] = [];

  try {
    // Upload de foto do falecido embutida no novo/editar.
    if (
      (acao === "novo" || acao === "editar") &&
      typeof payload.foto_falecido === "string" &&
      payload.foto_falecido.startsWith("data:")
    ) {
      const saved = await salvarDataUriContingencia(
        payload.foto_falecido,
        "atendimentos/falecido",
        String(payload.operation_id || undefined),
      );
      payload.foto_falecido = saved.url;
      uploadedPaths.push(saved.path);
    }

    // Ações novo/editar continuam usando o pipeline TS já validado.
    if (acao === "novo" || acao === "editar") {
      let obrigatoriedadeAtiva = false;
      let statusAtual: string | null = null;

      if (acao === "editar") {
        const id = Number(payload.id ?? 0);
        if (!Number.isInteger(id) || id <= 0) return jsonError("ID inválido.", 400);

        const { data: registro, error } = await supabase
          .schema("pai")
          .from("sepultamentos")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) return jsonError("Erro ao localizar atendimento.", 500);
        if (!registro) return jsonError("Registro não encontrado.", 404);
        if (registro.cancelado_em) {
          return jsonError("Este atendimento foi cancelado.", 409, "ATENDIMENTO_CANCELADO");
        }

        statusAtual = String(registro.status ?? "");
        obrigatoriedadeAtiva = obrigatoriedadeAtivaPorStatus(statusAtual);

        // Edição é parcial (PATCH): para validar regras posteriores,
        // combine o estado existente com os campos enviados pelo cliente.
        const payloadValidacao: Record<string, any> = {
          ...registro,
          ...payload,
        };

        try {
          await aplicarRegrasAtendimento(
            payloadValidacao,
            obrigatoriedadeAtiva,
            coroaRepositorySupabase,
          );

          // Mantém no payload real somente as chaves que o cliente enviou,
          // mas aproveita normalizações feitas pelo pipeline.
          for (const key of Object.keys(payload)) {
            if (Object.prototype.hasOwnProperty.call(payloadValidacao, key)) {
              payload[key] = payloadValidacao[key];
            }
          }
        } catch (error) {
          if (error instanceof RegraNegocioError) {
            return NextResponse.json(
              {
                sucesso: false,
                erro: true,
                ...(error.codigo ? { codigo: error.codigo } : {}),
                ...(error.detalhes !== undefined ? { detalhes: error.detalhes } : {}),
                msg: error.message,
              },
              { status: error.status },
            );
          }
          throw error;
        }
      }

      try {
        if (acao === "novo") {
          await aplicarRegrasAtendimento(payload, obrigatoriedadeAtiva, coroaRepositorySupabase);
        }
      } catch (error) {
        if (error instanceof RegraNegocioError) {
          return NextResponse.json(
            {
              sucesso: false,
              erro: true,
              ...(error.codigo ? { codigo: error.codigo } : {}),
              ...(error.detalhes !== undefined ? { detalhes: error.detalhes } : {}),
              msg: error.message,
            },
            { status: error.status },
          );
        }
        throw error;
      }

      if (payload.gravar_contingencia !== true) {
        return NextResponse.json({
          sucesso: true,
          modo: "contingencia",
          apenas_validacao: true,
          acao,
          atendimento_id: acao === "editar" ? Number(payload.id) : null,
          status_atual: statusAtual,
          fase_atual: statusAtual !== null ? numeroFaseStatus(statusAtual) : null,
          obrigatoriedade_ativa: obrigatoriedadeAtiva,
          tipo_terceiro: payloadTipoTerceiro(payload),
          msg: "Payload validado. Envie gravar_contingencia=true para efetivar.",
        });
      }

      const { data, error } = await supabase
        .schema("pai")
        .rpc("salvar_atendimento_contingencia_p0", {
          p_payload: payload,
          p_usuario_id: uid,
          p_usuario_nome: nome,
        });

      if (error) {
        for (const p of uploadedPaths) await removerArquivoContingencia(p);
        const mapped = rpcHttpError(error.message);
        return jsonError(mapped.msg, mapped.status, mapped.codigo);
      }

      return NextResponse.json({
        ...(data && typeof data === "object" ? data : { sucesso: true }),
        modo: "contingencia",
        gravado: true,
      });
    }

    if (acao === "salvar_foto_acao") {
      const tipo = String(payload.tipo ?? payload.foto_tipo ?? payload.status ?? "").toLowerCase();
      const fase = ["fim_ornamentacao", "ornamentacao", "fase06"].includes(tipo)
        ? "fase06"
        : ["entrega_corpo", "entrega", "fase08"].includes(tipo)
          ? "fase08"
          : "";

      if (!fase) return jsonError("Tipo de foto inválido.", 400);

      const raw = String(payload.base64 ?? payload.foto_base64 ?? payload.foto ?? "");
      if (!raw.startsWith("data:")) return jsonError("Foto base64 não enviada.", 400);

      const saved = await salvarDataUriContingencia(
        raw,
        fase === "fase06" ? "atendimentos/fim-ornamentacao" : "atendimentos/entrega-corpo",
        String(payload.operation_id || undefined),
      );
      uploadedPaths.push(saved.path);

      const rpcPayload = {
        ...payload,
        status: fase,
        foto_url: saved.url,
        foto_path: saved.path,
      };

      const { data, error } = await supabase
        .schema("pai")
        .rpc("p0_atualizar_status", {
          p_payload: rpcPayload,
          p_usuario_id: uid,
          p_usuario_nome: nome,
        });

      if (error) {
        await removerArquivoContingencia(saved.path);
        const mapped = rpcHttpError(error.message);
        return jsonError(mapped.msg, mapped.status, mapped.codigo);
      }

      return NextResponse.json({
        sucesso: true,
        tipo: fase === "fase06" ? "fim_ornamentacao" : "entrega_corpo",
        url: saved.url,
        path: saved.path,
        modo: "contingencia",
        resultado: data,
      });
    }

    if (acao === "atualizar_status") {
      const status = String(payload.status ?? "").toLowerCase();

      if (
        (status === "fase06" || status === "fase08") &&
        typeof (payload.foto_base64 ?? payload.base64 ?? payload.foto) === "string" &&
        String(payload.foto_base64 ?? payload.base64 ?? payload.foto).startsWith("data:")
      ) {
        const raw = String(payload.foto_base64 ?? payload.base64 ?? payload.foto);
        const saved = await salvarDataUriContingencia(
          raw,
          status === "fase06" ? "atendimentos/fim-ornamentacao" : "atendimentos/entrega-corpo",
          String(payload.operation_id || undefined),
        );
        payload.foto_url = saved.url;
        payload.foto_path = saved.path;
        uploadedPaths.push(saved.path);
      }

      const { data, error } = await supabase
        .schema("pai")
        .rpc("p0_atualizar_status", {
          p_payload: payload,
          p_usuario_id: uid,
          p_usuario_nome: nome,
        });

      if (error) {
        for (const p of uploadedPaths) await removerArquivoContingencia(p);
        const mapped = rpcHttpError(error.message);
        return jsonError(mapped.msg, mapped.status, mapped.codigo);
      }

      return NextResponse.json({ ...(data as object), modo: "contingencia" });
    }

    if (acao === "material_recolhido") {
      const { data, error } = await supabase
        .schema("pai")
        .rpc("p0_material_recolhido", {
          p_payload: payload,
          p_usuario_id: uid,
          p_usuario_nome: nome,
        });
      if (error) {
        const mapped = rpcHttpError(error.message);
        return jsonError(mapped.msg, mapped.status, mapped.codigo);
      }
      return NextResponse.json({ ...(data as object), modo: "contingencia" });
    }

    if (acao === "baixar_estoque" || acao === "corpo_pronto_estoque") {
      const id = Number(payload.id ?? payload.registro_id ?? 0);
      if (!Number.isInteger(id) || id <= 0) return jsonError("ID inválido.", 400);

      const { data, error } = await supabase
        .schema("pai")
        .rpc("p0_baixar_estoque_atendimento", {
          p_atendimento_id: id,
          p_usuario_id: uid,
          p_operation_id: payload.operation_id ? String(payload.operation_id) : null,
        });

      if (error) {
        const mapped = rpcHttpError(error.message);
        let detalhes: any = undefined;
        if (mapped.codigo === "ESTOQUE_INSUFICIENTE") {
          const match = String(error.message).match(/ESTOQUE_INSUFICIENTE:\s*(\[[\s\S]*\])/);
          if (match) {
            try { detalhes = JSON.parse(match[1]); } catch { /* noop */ }
          }
        }
        return NextResponse.json(
          { sucesso: false, erro: true, codigo: mapped.codigo, msg: mapped.msg, ...(detalhes ? { faltantes: detalhes } : {}) },
          { status: mapped.status },
        );
      }

      return NextResponse.json({ ...(data as object), modo: "contingencia" });
    }

    if (acao === "cancelar_atendimento") {
      const { data, error } = await supabase
        .schema("pai")
        .rpc("p0_cancelar_atendimento_basico", {
          p_payload: payload,
          p_usuario_id: uid,
          p_usuario_nome: nome,
        });

      if (error) {
        const mapped = rpcHttpError(error.message);
        return jsonError(mapped.msg, mapped.status, mapped.codigo);
      }

      return NextResponse.json({
        ...(data as object),
        modo: "contingencia",
        p0_limite: "O cancelamento P0 estorna estoque e cancela coroas; OS/financeiro ficam para o pacote P1.",
      });
    }

    return jsonError("Ação não suportada na contingência P0.", 400, "ACAO_NAO_SUPORTADA");
  } catch (error: any) {
    for (const p of uploadedPaths) await removerArquivoContingencia(p);

    const msg = String(error?.message ?? "Falha interna.");
    if (msg === "FOTO_INVALIDA" || msg === "FOTO_TAMANHO_INVALIDO" || msg === "TIPO_ARQUIVO_INVALIDO") {
      return jsonError("Foto inválida ou não suportada.", 400, "FOTO_INVALIDA");
    }

    console.error("[contingencia:p0]", error);
    return jsonError("Falha interna na contingência.", 500);
  }
}
