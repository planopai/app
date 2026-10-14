import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { validarPaiSession } from "@/lib/pai-session";

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
            {
                status: 401,
            },
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
            },
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
            },
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
            },
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
            },
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

            deposito_insumos:
                depositoInsumosPorUsuarioId(usuarioId),

            pode_conservacao:
                podeConservacao(
                    usuarioId,
                    String(usuario.cargo ?? ""),
                ),

            pode_alterar_itens_travados: podeAlterar,

            server_time: new Date().toISOString(),

            server_time_unix_ms: Date.now(),

            modo: "contingencia",
        });
    }

    /*
     * A partir daqui continuam os recursos normais.
     */

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
            },
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
            },
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
            {
                status: 400,
            },
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
            {
                status: 500,
            },
        );
    }

    let dados = data ?? [];

    /*
     * Enriquece sepultamentos com dados seguros de homenagem.
     * Não expõe senha_familiar_hash.
     */
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
                .order("atendimento_id", {
                    ascending: true,
                })
                .order("id", {
                    ascending: false,
                });

        if (homenagensError) {
            return NextResponse.json(
                {
                    ok: false,
                    erro: "Erro ao carregar homenagens",
                },
                {
                    status: 500,
                },
            );
        }

        const homenagensPorAtendimento =
            new Map<number, any>();

        for (const homenagem of homenagens ?? []) {
            const atendimentoId = Number(
                homenagem.atendimento_id,
            );

            if (
                atendimentoId > 0 &&
                !homenagensPorAtendimento.has(
                    atendimentoId,
                )
            ) {
                homenagensPorAtendimento.set(
                    atendimentoId,
                    homenagem,
                );
            }
        }

        dados = dados.map((registro: any) => {
            const atendimentoId = Number(registro.id);

            const homenagem =
                homenagensPorAtendimento.get(
                    atendimentoId,
                );

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