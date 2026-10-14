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

/** Amostras de áudio (mono, -1 a 1) → MP3 mono 64 kbps. O WhatsApp aceita MP3 sempre. */
export async function pcmParaMp3(amostras: Float32Array, taxa: number): Promise<Blob> {
    const pcm = new Int16Array(amostras.length);
    for (let i = 0; i < amostras.length; i++) {
        const s = Math.max(-1, Math.min(1, amostras[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const codificador = new Mp3Encoder(1, taxa, 64);
    const partes: Uint8Array[] = [];
    for (let i = 0; i < pcm.length; i += 1152) {
        const bloco = codificador.encodeBuffer(pcm.subarray(i, i + 1152));
        if (bloco.length) partes.push(new Uint8Array(bloco));
    }
    const fim = codificador.flush();
    if (fim.length) partes.push(new Uint8Array(fim));
    return new Blob(partes as BlobPart[], { type: "audio/mpeg" });
}

/**
 * Converte um arquivo de áudio para MP3 antes de mandar ao WhatsApp (áudio anexado pelo clipe).
 * A gravação feita no Messenger já sai em MP3 direto (ver GravadorMp3), sem precisar desta conversão.
 */
export async function audioParaMp3(arquivo: Blob): Promise<Blob> {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) throw new Error("Navegador sem suporte a áudio.");
    const ctx: AudioContext = new Ctx();
    try {
        const dados = await arquivo.arrayBuffer();
        const buf: AudioBuffer = await new Promise((ok, falha) => {
            const p = ctx.decodeAudioData(dados, ok, falha);
            if (p && typeof (p as any).then === "function") (p as Promise<AudioBuffer>).then(ok, falha);
        });
        const mono = new Float32Array(buf.length);
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < buf.length; i++) mono[i] += d[i] / buf.numberOfChannels;
        }
        return await pcmParaMp3(mono, buf.sampleRate);
    } finally {
        ctx.close?.().catch(() => {});
    }
}

/**
 * Gravador que capta o som direto do microfone (sem o MediaRecorder do navegador) e entrega MP3.
 * Usado nas conversas com clientes do WhatsApp: o MP4 do Safari e o WebM do Chrome são recusados pela Meta
 * ("Media file scrutiny ... failed"), e converter depois nem sempre funciona no Safari.
 */
export class GravadorMp3 {
    private ctx: AudioContext | null = null;
    private fonte: MediaStreamAudioSourceNode | null = null;
    private proc: ScriptProcessorNode | null = null;
    private blocos: Float32Array[] = [];

    async iniciar(stream: MediaStream) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) throw new Error("Navegador sem suporte a áudio.");
        this.ctx = new Ctx() as AudioContext;
        await this.ctx.resume().catch(() => {});
        this.fonte = this.ctx.createMediaStreamSource(stream);
        this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
        this.proc.onaudioprocess = (e) => {
            this.blocos.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        this.fonte.connect(this.proc);
        this.proc.connect(this.ctx.destination); // necessário para o Safari processar; a saída é silêncio
    }

    /** Para a captação. Com cancelar = true, descarta. */
    async parar(cancelar = false): Promise<Blob | null> {
        const taxa = this.ctx?.sampleRate || 44100;
        try {
            this.fonte?.disconnect();
            this.proc?.disconnect();
        } catch {
            /* já desligado */
        }
        await this.ctx?.close().catch(() => {});
        this.ctx = null;
        if (cancelar) return null;
        const total = this.blocos.reduce((n, b) => n + b.length, 0);
        if (!total) throw new Error("Nenhum som foi gravado.");
        const tudo = new Float32Array(total);
        let pos = 0;
        for (const b of this.blocos) {
            tudo.set(b, pos);
            pos += b.length;
        }
        this.blocos = [];
        return pcmParaMp3(tudo, taxa);
    }
}
