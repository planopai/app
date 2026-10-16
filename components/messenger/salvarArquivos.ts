"use client";

/**
 * Salvar fotos, áudios e documentos do Messenger no aparelho (16/10/2026).
 *
 * Manual (todos os aparelhos): botão "Baixar" no anexo. No celular, quando o navegador permite, abre o menu de
 * compartilhar do sistema ("Salvar imagem", "Salvar em Arquivos"); senão, baixa o arquivo com o nome original.
 * Automático (só Chrome/Edge no computador, que deixam o site gravar numa pasta escolhida): cada foto ou documento
 * recebido de cliente/colega é gravado sozinho na pasta escolhida em Configurações › Geral. A escolha vale por aparelho.
 *
 * O automático e o menu de compartilhar leem o arquivo direto do Cloudflare R2: o bucket precisa liberar o domínio do app
 * em CORS (GET). Sem isso, o manual continua funcionando pelo download comum.
 */
import { msgGet } from "./api";

type Anexo = { id: number; mime: string; nome_original?: string | null };
const CHAVE_MODO = "pai.msg.salvar"; // "manual" | "auto"
const BANCO = "pai-messenger";

export type ModoSalvar = "manual" | "auto";

export function modoSalvar(): ModoSalvar {
    try {
        return localStorage.getItem(CHAVE_MODO) === "auto" ? "auto" : "manual";
    } catch {
        return "manual";
    }
}

/** O navegador deixa gravar numa pasta escolhida? (Chrome/Edge no computador) */
export function aceitaPasta(): boolean {
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function abrirBanco(): Promise<IDBDatabase> {
    return new Promise((ok, falha) => {
        const r = indexedDB.open(BANCO, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("pastas");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => falha(r.error);
    });
}
async function lerPasta(): Promise<any | null> {
    try {
        const db = await abrirBanco();
        return await new Promise((ok) => {
            const t = db.transaction("pastas").objectStore("pastas").get("destino");
            t.onsuccess = () => ok(t.result || null);
            t.onerror = () => ok(null);
        });
    } catch {
        return null;
    }
}
async function gravarPasta(h: any | null): Promise<void> {
    const db = await abrirBanco();
    await new Promise<void>((ok) => {
        const st = db.transaction("pastas", "readwrite").objectStore("pastas");
        const t = h ? st.put(h, "destino") : st.delete("destino");
        t.onsuccess = () => ok();
        t.onerror = () => ok();
    });
}

/** Nome da pasta escolhida (ou ""), para a tela de configuração. */
export async function nomePasta(): Promise<string> {
    const h = await lerPasta();
    return h?.name || "";
}

/** Liga o salvar automático: pede a pasta (precisa ser chamado num clique). */
export async function ligarAutomatico(): Promise<string> {
    if (!aceitaPasta()) throw new Error("Este navegador não permite salvar sozinho numa pasta. Use o Chrome ou o Edge no computador.");
    const h = await (window as any).showDirectoryPicker({ id: "pai-messenger", mode: "readwrite" });
    await gravarPasta(h);
    localStorage.setItem(CHAVE_MODO, "auto");
    return h.name as string;
}

export async function desligarAutomatico(): Promise<void> {
    localStorage.setItem(CHAVE_MODO, "manual");
    await gravarPasta(null);
}

function nomeArquivo(a: Anexo): string {
    const ext = (a.mime.split("/")[1] || "bin").replace("jpeg", "jpg").replace("mpeg", "mp3").split(";")[0];
    const base = (a.nome_original || "").trim() || `messenger-${a.id}.${ext}`;
    return base.replace(/[\\/:*?"<>|]+/g, "_");
}

async function linkDownload(a: Anexo): Promise<string> {
    const d = await msgGet<{ url: string }>("anexo_url", { anexo_id: a.id, baixar: 1 }, false);
    return d.url;
}

/** Baixar agora (botão do anexo). */
export async function baixarAnexo(a: Anexo): Promise<void> {
    const url = await linkDownload(a);
    const nome = nomeArquivo(a);
    const celular = typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (celular && (navigator as any).canShare) {
        try {
            const blob = await (await fetch(url)).blob();
            const arq = new File([blob], nome, { type: a.mime });
            if ((navigator as any).canShare({ files: [arq] })) {
                await (navigator as any).share({ files: [arq] }); // "Salvar imagem" / "Salvar em Arquivos"
                return;
            }
        } catch (e: any) {
            if (e?.name === "AbortError") return; // a pessoa fechou o menu
        }
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** Salvar sozinho na pasta escolhida (anexos recebidos). Falha em silêncio: o manual continua disponível. */
export async function salvarAutomatico(anexos: Anexo[]): Promise<number> {
    if (modoSalvar() !== "auto" || !anexos.length) return 0;
    const pasta = await lerPasta();
    if (!pasta) return 0;
    try {
        if ((await pasta.queryPermission?.({ mode: "readwrite" })) !== "granted") return 0; // o navegador pede de novo na próxima vez que abrir as Configurações
    } catch {
        return 0;
    }
    let salvos = 0;
    for (const a of anexos) {
        if (!/^(image|application|text|video)\//.test(a.mime)) continue; // áudios ficam só no Messenger
        try {
            const blob = await (await fetch(await linkDownload(a))).blob();
            const h = await pasta.getFileHandle(nomeArquivo(a), { create: true });
            const w = await h.createWritable();
            await w.write(blob);
            await w.close();
            salvos++;
        } catch (e) {
            console.warn("[messenger] salvar automático:", e);
        }
    }
    return salvos;
}

/** Confere (num clique) se a permissão da pasta continua valendo; o Chrome pode pedir de novo depois de reiniciar. */
export async function confirmarPermissao(): Promise<boolean> {
    const pasta = await lerPasta();
    if (!pasta) return false;
    try {
        if ((await pasta.queryPermission({ mode: "readwrite" })) === "granted") return true;
        return (await pasta.requestPermission({ mode: "readwrite" })) === "granted";
    } catch {
        return false;
    }
}
