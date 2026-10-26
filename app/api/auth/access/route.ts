import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { validarPaiSession } from "@/lib/pai-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Modo = "primario" | "contingencia";

function cleanPermissions(values: unknown[]): string[] {
  const out = new Set<string>();

  for (const value of values) {
    const pagina =
      typeof value === "string"
        ? value
        : value &&
            typeof value === "object" &&
            "pagina" in value
          ? String((value as { pagina?: unknown }).pagina ?? "")
          : "";

    const normalized = pagina.trim();

    if (normalized) {
      out.add(normalized);
    }
  }

  return Array.from(out);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 6000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await response.text();

    let json: any = null;

    try {
      json = JSON.parse(text.replace(/^\uFEFF/, "").trim());
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function accessPrimario(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const cookieHeader = request.headers.get("cookie") || "";

  const who = await fetchJsonWithTimeout(
    `${origin}/api/php/pai_api.php?action=whoami`,
    {
      method: "GET",
      headers: {
        "x-requested-with": "XMLHttpRequest",
        cookie: cookieHeader,
      },
    },
  );

  const uid = Number(who.json?.id || 0);

  const userName = String(
    who.json?.nome ??
      who.json?.name ??
      who.json?.usuario ??
      "",
  ).trim();

  if (!who.ok || uid <= 0 || !userName) {
    throw new Error("Sessão primária não reconhecida pela HostGator.");
  }

  const permissions = await fetchJsonWithTimeout(
    `${origin}/api/php/pai_api.php?action=list_permissions&user_id=${encodeURIComponent(
      String(uid),
    )}`,
    {
      method: "GET",
      headers: {
        "x-requested-with": "XMLHttpRequest",
        cookie: cookieHeader,
      },
    },
  );

  if (!permissions.ok || !Array.isArray(permissions.json)) {
    throw new Error("Não foi possível carregar permissões da HostGator.");
  }

  return {
    uid,
    userName,
    perms: cleanPermissions(permissions.json),
  };
}

async function accessContingencia(usuarioLogin: string) {
  const { data: usuario, error: usuarioError } = await supabase
    .schema("pai")
    .from("usuarios")
    .select("id,nome,usuario,cargo")
    .eq("usuario", usuarioLogin)
    .maybeSingle();

  if (usuarioError) {
    throw new Error(`Supabase/usuarios: ${usuarioError.message}`);
  }

  if (!usuario) {
    throw new Error("Usuário da contingência não encontrado.");
  }

  const { data: cargo, error: cargoError } = await supabase
    .schema("pai")
    .from("cargos")
    .select("id,nome,slug,ativo")
    .eq("slug", String(usuario.cargo ?? ""))
    .eq("ativo", true)
    .maybeSingle();

  if (cargoError) {
    throw new Error(`Supabase/cargos: ${cargoError.message}`);
  }

  if (!cargo) {
    throw new Error("Cargo inválido ou inativo na contingência.");
  }

  const [
    { data: permissoesUsuario, error: permissoesUsuarioError },
    { data: permissoesCargo, error: permissoesCargoError },
  ] = await Promise.all([
    supabase
      .schema("pai")
      .from("permissoes")
      .select("pagina")
      .eq("user_id", Number(usuario.id)),
    supabase
      .schema("pai")
      .from("cargo_paginas")
      .select("pagina")
      .eq("cargo_id", Number(cargo.id)),
  ]);

  if (permissoesUsuarioError) {
    throw new Error(
      `Supabase/permissoes: ${permissoesUsuarioError.message}`,
    );
  }

  if (permissoesCargoError) {
    throw new Error(
      `Supabase/cargo_paginas: ${permissoesCargoError.message}`,
    );
  }

  const perms = cleanPermissions([
    ...(permissoesUsuario ?? []),
    ...(permissoesCargo ?? []),
  ]);

  return {
    uid: Number(usuario.id),
    userName: String(
      usuario.nome ??
        usuario.usuario ??
        usuarioLogin,
    ).trim(),
    perms,
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);

  if (!sessao) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sessão inválida ou expirada.",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // O force de contingência também prevalece para sessões primárias já abertas.
  const forceContingencia =
    process.env.PAI_AUTH_FORCE_CONTINGENCIA === "1";

  const modo: Modo =
    forceContingencia || sessao.modo === "contingencia"
      ? "contingencia"
      : "primario";

  try {
    const access =
      modo === "contingencia"
        ? await accessContingencia(sessao.usuario)
        : await accessPrimario(request);

    return NextResponse.json(
      {
        ok: true,
        modo,
        uid: access.uid,
        userName: access.userName,
        perms: access.perms,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        modo,
        error: String(
          error?.message ??
            "Falha ao validar acesso.",
        ),
      },
      {
        status: modo === "primario" ? 503 : 403,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
