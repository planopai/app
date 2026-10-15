import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase-server";

const BUCKET = "pai-contingencia";

type SavedFile = {
  path: string;
  url: string;
  mime: string;
};

function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      throw new Error("TIPO_ARQUIVO_INVALIDO");
  }
}

export async function salvarDataUriContingencia(
  dataUri: string,
  pasta: string,
  chave?: string,
): Promise<SavedFile> {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    String(dataUri ?? "").trim(),
  );

  if (!m) {
    throw new Error("FOTO_INVALIDA");
  }

  const mime = m[1].toLowerCase();
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");

  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    throw new Error("FOTO_TAMANHO_INVALIDO");
  }

  const ext = extForMime(mime);
  const safeKey = String(chave || randomUUID()).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || randomUUID();
  const nome = `${safeKey}.${ext}`;
  const path = `${pasta.replace(/^\/+|\/+$/g, "")}/${nome}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(`FOTO_UPLOAD: ${error.message}`);
  }

  return {
    path,
    url: `/api/contingencia/arquivo?path=${encodeURIComponent(path)}`,
    mime,
  };
}

export async function removerArquivoContingencia(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
}
