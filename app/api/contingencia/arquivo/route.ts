import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { validarPaiSession } from "@/lib/pai-session";

const BUCKET = "pai-contingencia";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pai_session")?.value;
  const sessao = validarPaiSession(token);

  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão inválida ou expirada" }, { status: 401 });
  }

  const path = String(new URL(request.url).searchParams.get("path") ?? "").trim();

  if (
    !path ||
    path.includes("..") ||
    path.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(path)
  ) {
    return NextResponse.json({ ok: false, erro: "Arquivo inválido" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, erro: "Arquivo não encontrado" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
