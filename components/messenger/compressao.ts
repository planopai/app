/**
 * Reduz a foto antes de enviar: lado maior até 1600 px, JPEG ~80% (uma foto de 3–5 MB cai para ~250 KB),
 * e gera uma miniatura de 320 px para a lista de mensagens.
 */
export type FotoComprimida = { arquivo: Blob; miniatura: Blob; largura: number; altura: number };

function carregarImagem(arquivo: Blob): Promise<HTMLImageElement> {
    return new Promise((ok, falha) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            ok(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            falha(new Error("Não foi possível abrir a imagem."));
        };
        img.src = url;
    });
}

function redimensionar(img: HTMLImageElement, ladoMax: number, qualidade: number): Promise<{ blob: Blob; w: number; h: number }> {
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Navegador sem suporte a canvas.");
    ctx.fillStyle = "#FFFFFF"; // PNG com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((ok, falha) =>
        canvas.toBlob((b) => (b ? ok({ blob: b, w, h }) : falha(new Error("Falha ao comprimir a imagem."))), "image/jpeg", qualidade)
    );
}

export async function comprimirFoto(arquivo: Blob): Promise<FotoComprimida> {
    const img = await carregarImagem(arquivo);
    const grande = await redimensionar(img, 1600, 0.8);
    const mini = await redimensionar(img, 320, 0.7);
    return { arquivo: grande.blob, miniatura: mini.blob, largura: grande.w, altura: grande.h };
}

/** Formato de gravação de áudio que o WhatsApp também aceita, conforme o aparelho. */
export function formatoAudio(): string {
    const opcoes = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
    if (typeof MediaRecorder === "undefined") return "";
    return opcoes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/**
 * Converte um áudio gravado no navegador para MP3 (mono, 64 kbps) antes de mandar ao WhatsApp (14/10/2026).
 * O Safari grava MP4 "fragmentado" e o Chrome grava WebM: o WhatsApp recusa os dois
 * ("Media file scrutiny ... failed"). MP3 o WhatsApp aceita sempre. Tudo acontece no próprio aparelho.
 */
export async function audioParaMp3(arquivo: Blob): Promise<Blob> {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) throw new Error("Navegador sem suporte a áudio.");
    const ctx: AudioContext = new Ctx();
    try {
        const dados = await arquivo.arrayBuffer();
        const buf: AudioBuffer = await new Promise((ok, falha) => {
            // forma com callback: funciona também no Safari mais antigo
            const p = ctx.decodeAudioData(dados, ok, falha);
            if (p && typeof (p as any).then === "function") (p as Promise<AudioBuffer>).then(ok, falha);
        });
        const n = buf.length;
        const canais = buf.numberOfChannels;
        const pcm = new Int16Array(n);
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (let c = 0; c < canais; c++) s += buf.getChannelData(c)[i];
            s = Math.max(-1, Math.min(1, s / canais));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const { Mp3Encoder } = await import("@breezystack/lamejs");
        const codificador = new Mp3Encoder(1, buf.sampleRate, 64);
        const partes: Uint8Array[] = [];
        for (let i = 0; i < n; i += 1152) {
            const bloco = codificador.encodeBuffer(pcm.subarray(i, i + 1152));
            if (bloco.length) partes.push(new Uint8Array(bloco));
        }
        const fim = codificador.flush();
        if (fim.length) partes.push(new Uint8Array(fim));
        return new Blob(partes as BlobPart[], { type: "audio/mpeg" });
    } finally {
        ctx.close?.().catch(() => {});
    }
}
