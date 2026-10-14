import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { validarPaiSession } from "@/lib/pai-session";

export async function GET(request: NextRequest) {
    const token = request.cookies.get("pai_session")?.value;

    const sessao = validarPaiSession(token);

    if (!sessao) {
        return NextResponse.json(
            {
                ok: false,
                erro: "Sessão inválida ou expirada",
            },
            {
                status: 401,
            }
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
            {
                status: 500,
            }
        );
    }

    if (!usuario) {
        return NextResponse.json(
            {
                ok: false,
                erro: "Usuário não encontrado",
            },
            {
                status: 403,
            }
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
            {
                status: 500,
            }
        );
    }

    if (!cargo) {
        return NextResponse.json(
            {
                ok: false,
                erro: "Cargo inválido ou inativo",
            },
            {
                status: 403,
            }
        );
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
            {
                status: 500,
            }
        );
    }

    if (!permissao) {
        return NextResponse.json(
            {
                ok: false,
                erro: "Usuário sem permissão para atendimento",
            },
            {
                status: 403,
            }
        );
    }

    const { searchParams } = new URL(request.url);

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
            {
                status: 400,
            }
        );
    }

    const tabela =
        recurso === "sepultamentos"
            ? "sepultamentos"
            : "os_ordens";

    const { data, error } = await supabase
        .schema("pai")
        .from(tabela)
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        return NextResponse.json(
            {
                ok: false,
                erro: error.message,
            },
            {
                status: 500,
            }
        );
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
        dados: data,
    });
}