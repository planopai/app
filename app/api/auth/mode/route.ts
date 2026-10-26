import { NextRequest, NextResponse } from "next/server";
import { validarPaiSession } from "@/lib/pai-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);

  if (!sessao) {
    return NextResponse.json(
      { sucesso: false, error: "Sessão inválida ou expirada." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    sucesso: true,
    modo: sessao.modo === "contingencia" ? "contingencia" : "primario",
  });
}
