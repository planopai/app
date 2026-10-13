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

    const { searchParams } = new URL(request.url);

    const recurso = searchParams.get("recurso");

    if (recurso !== "os_ordens") {
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

    const { data, error } = await supabase
        .schema("pai")
        .from("os_ordens")
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
        usuario: sessao.usuario,
        recurso,
        dados: data,
    });
}