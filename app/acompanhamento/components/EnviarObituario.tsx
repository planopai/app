"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    IconDownload,
    IconPhoto,
    IconRefresh,
    IconPalette,
    IconX,
} from "@tabler/icons-react";
import * as QRCode from "qrcode";
import Modal from "./Modal";
import type { Registro } from "./types";
import { Maiden_Orange } from "next/font/google";

type ModeloKey =
    | "modelo01"
    | "modelo02"
    | "modelo03"
    | "modelo04"
    | "modelo05"
    | "modelo06"
    | "modelo07"
    | "modelo08";

type QrBox = {
    x: number;
    y: number;
    w: number;
    h: number;
};

const NOTA_PESAR_FIXA = "Eternas Saudades de Seus Familiares e Amigos.";

const MODELO_NUMEROS: Record<ModeloKey, number> = {
    modelo01: 1,
    modelo02: 2,
    modelo03: 3,
    modelo04: 4,
    modelo05: 5,
    modelo06: 6,
    modelo07: 7,
    modelo08: 8,
};

function getModeloSrc(modelo: ModeloKey, comQr: boolean) {
    const numero = MODELO_NUMEROS[modelo] || 1;
    const prefixo = comQr ? "QR" : "SQR";

    return `/obituario-modelos/${prefixo}${numero}.png`;
}

const MODELOS_OPTIONS: Array<{ value: ModeloKey; label: string }> = [
    { value: "modelo01", label: "Modelo 01" },
    { value: "modelo02", label: "Modelo 02" },
    { value: "modelo03", label: "Modelo 03" },
    { value: "modelo04", label: "Modelo 04" },
    { value: "modelo05", label: "Modelo 05" },
    { value: "modelo06", label: "Modelo 06" },
    { value: "modelo07", label: "Modelo 07" },
    { value: "modelo08", label: "Modelo 08" },
];

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const LEGADO_LUZ_URL = "https://planoassistencialintegrado.com.br/legado-de-luz/";
const MODELO_A4_QR = "/obituario-modelos/A4QR1.png";
const MODELO_A4_SQR = "/obituario-modelos/A4SQR1.png";

// Exportação A4 real em pixels, mantendo proporção ISO A4.
// 1240x1754 equivale aproximadamente a A4 em 150 DPI.
const A4_EXPORT_WIDTH = 1240;
const A4_EXPORT_HEIGHT = 1754;

// Base de desenho usada pelas posições atuais do template A4.
// O canvas exportado é escalado a partir dessas coordenadas.
const A4_DESIGN_WIDTH = 1122;
const A4_DESIGN_HEIGHT = 1402;

function getModeloA4Src(comQr: boolean) {
    return comQr ? MODELO_A4_QR : MODELO_A4_SQR;
}

const POSICOES_A4 = {
    // A4: frases menores para caber melhor no topo.
    mensagem: { x: 561, y: 185, maxWidth: 870, lineHeight: 29 },

    // A4: foto 20% maior, preservando o topo e crescendo para baixo.
    foto: { centerX: 300, centerY: 593, ovalW: 432, ovalH: 600 },

    // A4: nome mais à direita, afastado da foto, maior, em negrito e posicionado mais abaixo.
    nome: { x: 600, y: 595, maxWidth: 420, lineHeight: 70, fontSize: 62, minFontSize: 46 },

    // A4: separador curto e fino entre o nome e as datas.
    separadorNomeData: { x: 600, yOffset: 24, w: 360 },

    // A4: datas mais à direita, sempre mantendo distância fixa do nome.
    datas: { x: 600, yOffset: 60, gapX: 235 },

    // A4: QR Code maior, alinhado ao início do nome e das datas, mais abaixo.
    qr: { x: 600, y: 900, w: 420, h: 420 } as QrBox,
};

const FRASES_A4 = [

    `"Ainda que eu andasse pelo vale da sombra da morte, não temeria mal algum, porque tu estás comigo..." (Salmo 23:4) — Na hora da partida, encontramos consolo ao saber que o sofrimento deu lugar à paz eterna. Que a transição seja de luz e acolhimento nos braços do Criador.`,
    `"Disse-lhe Jesus: Eu sou a ressurreição e a vida; quem crê em mim, ainda que esteja morto, viverá." (João 11:25) — A morte não é o fim, mas o início de uma jornada eterna. Guardamos a esperança do reencontro e a certeza de que o amor nunca morre.`,
    `"Tudo tem o seu tempo determinado, e há tempo para todo o propósito debaixo do céu... tempo de nascer, e tempo de morrer." (Eclesiastes 3:1-2) — Aceitar a partida é compreender o mistério do tempo de Deus. Agradecemos profundamente pelos anos que pudemos compartilhar ao seu lado.`,
    `"A morte não é apagar a luz; é apenas apagar a lâmpada porque o amanhecer chegou." — Quem tanto amou e foi amado nunca deixa de existir. A matéria se desfaz, mas a essência e as memórias tornam-se eternas dentro de nós.`,
    `"Aqueles que amamos e perdemos não estão mais onde estavam, mas estão sempre onde quer que nós estejamos." — A dor da despedida é proporcional à beleza do convívio. Que a saudade que hoje aperta o peito se transforme, com o tempo, em uma doce e grata lembrança.`,
    `"O valor de uma vida não se mede pelo tempo que ela durou, mas pelas pegadas de amor e bondade que deixou no caminho." — Nos despedimos de uma alma generosa, cuja passagem por este mundo o tornou um lugar mais caloroso e bonito. Seu exemplo continuará a nos guiar.`,
    `"A vida dos mortos coloca-se na memória dos vivos." (Cícero) — Diante do mistério da partida, silenciamos em respeito e gratidão. Honraremos a sua história continuando a viver de acordo com os valores que nos foram ensinados.`,
    `"Partir é apenas mudar de sala neste imenso palácio que é o universo." — Olhamos para a despedida não como um ponto final, mas como uma passagem silenciosa e serena para a grande paz que a todos nós aguarda.`,
    `"Não há morte para aqueles que deixam o coração cheio de lembranças vivas na mente de quem fica." — Dizemos adeus ao corpo, mas nunca à história, ao sorriso e aos ensinamentos. Você permanece vivo em cada um de nós.`,
];

const QR_POSITIONS: Record<ModeloKey, QrBox> = {
    modelo01: { x: 720, y: 1548, w: 315, h: 315 },
    modelo02: { x: 720, y: 1548, w: 315, h: 315 },
    modelo03: { x: 720, y: 1548, w: 315, h: 315 },
    modelo04: { x: 720, y: 1548, w: 315, h: 315 },
    modelo05: { x: 720, y: 1548, w: 315, h: 315 },
    modelo06: { x: 720, y: 1548, w: 315, h: 315 },
    modelo07: { x: 720, y: 1548, w: 315, h: 315 },
    modelo08: { x: 720, y: 1548, w: 315, h: 315 },
};

function onlyDigits(s: string) {
    return String(s || "").replace(/\D+/g, "");
}

function isoToBR(iso?: string) {
    const s = String(iso || "").trim();

    if (!s) return "";

    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const [, yyyy, mm, dd] = m;
        return `${dd}/${mm}/${yyyy}`;
    }

    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return s;

    return "";
}

function normalizeDateToBR(input?: string) {
    const s = String(input || "").trim();
    if (!s) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoToBR(s);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    const d = onlyDigits(s).slice(0, 8);
    if (d.length !== 8) return s;

    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
}

function normalizeHHMM(v?: string) {
    const raw = String(v || "").trim();
    if (!raw) return "";

    const m = raw.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
    if (m) {
        const hh = m[1].padStart(2, "0");
        const mm = m[2].padStart(2, "0");
        return `${hh}:${mm}`;
    }

    const d = onlyDigits(raw).slice(0, 4);
    if (!d) return "";

    let hh = d.slice(0, 2);
    let mm = d.slice(2, 4);

    if (hh.length === 1) hh = "0" + hh;
    if (!mm) mm = "00";
    if (mm.length === 1) mm = mm + "0";

    return `${hh}:${mm}`;
}

function normalizarFotoUrl(src?: string) {
    let s = String(src || "").trim();

    if (!s) return "";

    s = s
        .replace(/&amp;/g, "&")
        .replace(/&#038;/g, "&")
        .replace(/\\/g, "/");

    if (s.startsWith("data:")) return s;

    if (/^https?:\/\//i.test(s)) return s;

    if (s.startsWith("/")) {
        return `${API_BASE}${s}`;
    }

    return `${API_BASE}/${s.replace(/^\/+/, "")}`;
}

function pickFirst(...values: any[]) {
    for (const v of values) {
        const s = String(v ?? "").trim();
        if (s) return s;
    }

    return "";
}

function montarLocalVelorio(registro?: Registro | null) {
    if (!registro) return "";

    const localVelorio = String((registro as any).local_velorio ?? "").trim();
    if (localVelorio) return localVelorio;

    const sala = String((registro as any).sala_velorio ?? "").trim();
    if (sala) return `Memorial - ${sala}`;

    return "";
}

function nomeArquivoSeguro(nome?: string) {
    const base = String(nome || "obituario")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return base || "obituario";
}

function limparCodigo(codigo?: string | number | null) {
    return String(codigo ?? "")
        .trim()
        .replace(/^\/+|\/+$/g, "");
}

function getCodigoHomenagem(registro?: Registro | null) {
    const r = registro as any;

    return limparCodigo(
        r?.codigo_homenagem ||
        r?.homenagem_codigo ||
        r?.homenagem_slug ||
        r?.slug_homenagem ||
        r?.legado_luz_codigo ||
        r?.legado_luz_slug
    );
}

function getAtendimentoIdLegado(registro?: Registro | null) {
    const r = registro as any;

    return String(
        r?.legado_luz_atendimento_id ||
        r?.atendimento_id ||
        r?.id ||
        ""
    ).trim();
}

function getLegadoLuzUrl(registro?: Registro | null) {
    const r = registro as any;

    // O QR Code deve apontar para o Legado de Luz pelo ID do atendimento.
    // Assim, se o nome/slug do falecido for corrigido, o QR continua funcionando.
    const atendimentoId = getAtendimentoIdLegado(registro);

    if (atendimentoId) {
        return `${LEGADO_LUZ_URL}?atendimento_id=${encodeURIComponent(atendimentoId)}`;
    }

    // Compatibilidade temporária para registros antigos sem ID disponível.
    const codigo = getCodigoHomenagem(registro);

    if (codigo) {
        return `${LEGADO_LUZ_URL}?codigo=${encodeURIComponent(codigo)}`;
    }

    // Último fallback: links antigos retornados pela API.
    const linkExistente = String(
        r?.legado_luz_link ||
        r?.homenagem_link_publico ||
        r?.link_homenagem ||
        r?.link_publico ||
        ""
    ).trim();

    if (linkExistente && /^https?:\/\//i.test(linkExistente)) {
        return linkExistente;
    }

    return "";
}

function getRegistroUpdateKey(registro?: Registro | null) {
    const r = registro as any;

    return [
        r?.id,
        r?.atendimento_id,
        r?.legado_luz_atendimento_id,
        r?.falecido,
        r?.nome_completo,
        r?.nome_falecido,
        r?.data_nascimento,
        r?.data_falecimento,
        r?.foto_falecido,
        r?.foto_url,
        r?.local_velorio,
        r?.sala_velorio,
        r?.data_inicio_velorio,
        r?.data_velorio_online,
        r?.hora_inicio_velorio,
        r?.horario_inicio,
        r?.data_fim_velorio,
        r?.data_fim,
        r?.hora_fim_velorio,
        r?.horario_termino,
        r?.data_sepultamento,
        r?.horario_sepultamento,
        r?.local_sepultamento,
        r?.local,
        r?.velorio_online,
        r?.codigo_homenagem,
        r?.homenagem_codigo,
        r?.homenagem_slug,
        r?.slug_homenagem,
        r?.legado_luz_codigo,
        r?.legado_luz_slug,
        r?.legado_luz_link,
        r?.homenagem_link_publico,
        r?.link_homenagem,
        r?.link_publico,
    ]
        .map((v) => String(v ?? "").trim())
        .join("|");
}

async function ensureFontLoaded(font: string) {
    try {
        const webFonts: Record<string, string> = {
            Nunito:
                "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap",
            Roboto:
                "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
        };

        if (webFonts[font]) {
            const attr = `data-font-${font.replace(/\s+/g, "-")}`;

            if (!document.querySelector(`link[${attr}]`)) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = webFonts[font];
                link.setAttribute(attr, "true");
                document.head.appendChild(link);
            }
        }

        await Promise.all([
            document.fonts.load(`400 16px "${font}"`),
            document.fonts.load(`600 16px "${font}"`),
            document.fonts.load(`700 16px "${font}"`),
            document.fonts.load(`800 16px "${font}"`),
        ]);

        await document.fonts.ready;
    } catch {
        // fallback do navegador
    }
}

async function urlToDataURL(url: string): Promise<string> {
    const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        mode: "cors",
    });

    if (!res.ok) {
        throw new Error(`Falha ao carregar imagem: HTTP ${res.status}`);
    }

    const blob = await res.blob();

    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        if (!src.startsWith("data:")) {
            img.crossOrigin = "anonymous";
        }

        img.onload = () => resolve(img);
        img.onerror = () =>
            reject(new Error(`Não foi possível carregar a imagem: ${src}`));
        img.src = src;
    });
}

function dataUrlToUint8Array(dataUrl: string) {
    const parts = String(dataUrl || "").split(",");

    if (parts.length < 2) {
        throw new Error("Imagem inválida para gerar PDF.");
    }

    const header = parts[0] || "";
    const base64 = parts.slice(1).join(",");
    const mime = header.match(/data:([^;]+);base64/i)?.[1] || "image/jpeg";
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return { bytes, mime };
}

function criarPdfA4ComImagem(dataUrl: string) {
    const { bytes, mime } = dataUrlToUint8Array(dataUrl);

    if (mime !== "image/jpeg" && mime !== "image/jpg") {
        throw new Error("A imagem do A4 precisa estar em JPEG para gerar o PDF.");
    }

    const encoder = new TextEncoder();
    const chunks: BlobPart[] = [];
    const offsets: number[] = [];
    let offset = 0;

    const addString = (value: string) => {
        chunks.push(value);
        offset += encoder.encode(value).length;
    };

    const addBytes = (value: Uint8Array) => {
        // Converte explicitamente para ArrayBuffer para evitar erro do TypeScript
        // com Uint8Array<ArrayBufferLike> em projetos com tipagem DOM mais restrita.
        const buffer = new ArrayBuffer(value.byteLength);
        new Uint8Array(buffer).set(value);
        chunks.push(buffer);
        offset += value.byteLength;
    };

    const pageW = 595.28;
    const pageH = 841.89;
    const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;

    addString("%PDF-1.4\n");

    offsets[1] = offset;
    addString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    offsets[2] = offset;
    addString("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    offsets[3] = offset;
    addString(
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    );

    offsets[4] = offset;
    addString(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${A4_EXPORT_WIDTH} /Height ${A4_EXPORT_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`
    );
    addBytes(bytes);
    addString("\nendstream\nendobj\n");

    offsets[5] = offset;
    addString(
        `5 0 obj\n<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    const xrefOffset = offset;

    addString("xref\n0 6\n");
    addString("0000000000 65535 f \n");

    for (let i = 1; i <= 5; i++) {
        addString(`${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`);
    }

    addString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(chunks, { type: "application/pdf" });
}

function baixarBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

async function carregarImagemParaCanvas(src: string): Promise<HTMLImageElement> {
    const normalizada = normalizarFotoUrl(src);

    if (!normalizada) {
        throw new Error("Foto vazia.");
    }

    if (normalizada.startsWith("data:")) {
        return loadImage(normalizada);
    }

    try {
        const dataUrl = await urlToDataURL(normalizada);
        return loadImage(dataUrl);
    } catch {
        return loadImage(normalizada);
    }
}

function drawWrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    align: "center" | "left" | "right" = "center"
) {
    const words = String(text || "")
        .split(/\s+/)
        .filter(Boolean);

    let line = "";

    ctx.textAlign = align;

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const width = ctx.measureText(testLine).width;

        if (width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[i] + " ";
            y += lineHeight;
        } else {
            line = testLine;
        }
    }

    if (line.trim()) {
        ctx.fillText(line.trim(), x, y);
    }
}

function montarLinhasNomeA4(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    initialFontSize: number,
    minFontSize: number,
    fontFamily: string
) {
    const words = String(text || "")
        .split(/\s+/)
        .filter(Boolean);

    const primeiraLinha = words.slice(0, 2).join(" ");
    const segundaLinha = words.length > 2 ? words.slice(2).join(" ") : "";
    const lines = [primeiraLinha, segundaLinha].filter(Boolean);

    let fontSize = initialFontSize;

    while (fontSize >= minFontSize) {
        ctx.font = `800 ${fontSize}px "${fontFamily}"`;

        const coube = lines.every((line) => ctx.measureText(line).width <= maxWidth);
        if (coube) break;

        fontSize -= 2;
    }

    return {
        lines,
        fontSize: Math.max(fontSize, minFontSize),
    };
}

function desenharLinhaSeparadoraA4(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    color: string
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    ctx.restore();
}

async function desenharQrLegadoLuz(
    ctx: CanvasRenderingContext2D,
    url: string,
    box: QrBox
) {
    if (!url) return;

    const qrDataUrl = await QRCode.toDataURL(url, {
        width: 520,
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
            dark: "#001f5b",
            light: "#ffffff",
        },
    });

    const qrImg = await loadImage(qrDataUrl);

    ctx.save();

    // Sem textos: apenas o QR Code, maior e mais abaixo no quadrado branco.
    const qrSize = Math.min(box.w - 38, box.h - 38);
    const qrX = box.x + (box.w - qrSize) / 2;
    const qrY = box.y + (box.h - qrSize) / 2 + 14;

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    ctx.restore();
}

async function desenharQrLegadoLuzA4(
    ctx: CanvasRenderingContext2D,
    url: string,
    box: QrBox
) {
    if (!url) return;

    const qrDataUrl = await QRCode.toDataURL(url, {
        width: 900,
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
            dark: "#001f5b",
            light: "#ffffff",
        },
    });

    const qrImg = await loadImage(qrDataUrl);

    ctx.save();

    const qrSize = Math.min(box.w, box.h);
    const qrX = box.x;
    const qrY = box.y;

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    ctx.restore();
}

function montarLinhaDataHora(data?: string, horaInicio?: string, horaFim?: string) {
    const dataLimpa = String(data || "").trim();
    const inicio = String(horaInicio || "").trim();
    const fim = String(horaFim || "").trim();

    const horario = inicio && fim ? `${inicio} às ${fim}` : inicio || fim;

    return [dataLimpa, horario].filter(Boolean).join(" - ");
}

type DadosObituario = {
    nome: string;
    data_nascimento: string;
    data_falecimento: string;
    foto_falecido: string;
    local_cerimonia: string;
    data_cerimonia: string;
    velorio_inicio: string;
    velorio_fim: string;
    fim_data_cerimonia: string;
    data_sepultamento: string;
    hora_sepultamento: string;
    local_sepultamento: string;
    nota_pesar: string;
    transmissao_inicio_data: string;
    transmissao_inicio_hora: string;
    transmissao_fim_data: string;
    transmissao_fim_hora: string;
};

function montarDados(registro?: Registro | null): DadosObituario {
    const dataInicioVelorio = pickFirst(
        (registro as any)?.data_inicio_velorio,
        (registro as any)?.data_velorio_online
    );

    const horaInicioVelorio = pickFirst(
        (registro as any)?.hora_inicio_velorio,
        (registro as any)?.horario_inicio
    );

    const dataFimVelorio = pickFirst(
        (registro as any)?.data_fim_velorio,
        (registro as any)?.data_fim,
        (registro as any)?.data_sepultamento
    );

    const horaFimVelorio = pickFirst(
        (registro as any)?.hora_fim_velorio,
        (registro as any)?.horario_termino,
        (registro as any)?.horario_sepultamento
    );

    const velorioOnline =
        String((registro as any)?.velorio_online ?? "")
            .trim()
            .toLowerCase() === "sim";

    return {
        nome: pickFirst(
            (registro as any)?.falecido,
            (registro as any)?.nome_completo,
            (registro as any)?.nome_falecido
        ),

        data_nascimento: normalizeDateToBR((registro as any)?.data_nascimento),
        data_falecimento: normalizeDateToBR((registro as any)?.data_falecimento),

        foto_falecido: normalizarFotoUrl(
            pickFirst((registro as any)?.foto_falecido, (registro as any)?.foto_url)
        ),

        local_cerimonia: montarLocalVelorio(registro),
        data_cerimonia: normalizeDateToBR(dataInicioVelorio),
        velorio_inicio: normalizeHHMM(horaInicioVelorio),
        velorio_fim: normalizeHHMM(horaFimVelorio),
        fim_data_cerimonia: normalizeDateToBR(dataFimVelorio),

        data_sepultamento: normalizeDateToBR(
            pickFirst(
                (registro as any)?.data_sepultamento,
                (registro as any)?.data_fim_velorio,
                (registro as any)?.data_fim
            )
        ),

        hora_sepultamento: normalizeHHMM(
            pickFirst(
                (registro as any)?.horario_sepultamento,
                (registro as any)?.hora_fim_velorio,
                (registro as any)?.horario_termino
            )
        ),

        local_sepultamento: pickFirst(
            (registro as any)?.local_sepultamento,
            (registro as any)?.local
        ),

        nota_pesar: NOTA_PESAR_FIXA,

        transmissao_inicio_data: velorioOnline
            ? normalizeDateToBR(dataInicioVelorio)
            : "",
        transmissao_inicio_hora: velorioOnline
            ? normalizeHHMM(horaInicioVelorio)
            : "",
        transmissao_fim_data: velorioOnline ? normalizeDateToBR(dataFimVelorio) : "",
        transmissao_fim_hora: velorioOnline ? normalizeHHMM(horaFimVelorio) : "",
    };
}

export default function EnviarObituario({
    registro,
}: {
    registro?: Registro | null;
}) {
    const [open, setOpen] = useState(false);
    const [modelo, setModelo] = useState<ModeloKey>("modelo01");
    const [fotoPretoBranco, setFotoPretoBranco] = useState(false);
    const [fontName, setFontName] = useState("Nunito");
    const [fontColor, setFontColor] = useState("#111827");
    const [incluirQrLegado, setIncluirQrLegado] = useState(false);

    const [previewSrc, setPreviewSrc] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");

    const [openA4, setOpenA4] = useState(false);
    const [fraseA4Selecionada, setFraseA4Selecionada] = useState("0");
    const [fraseA4Personalizada, setFraseA4Personalizada] = useState("");
    const [previewA4Src, setPreviewA4Src] = useState("");
    const [loadingA4, setLoadingA4] = useState(false);
    const [erroA4, setErroA4] = useState("");

    const registroUpdateKey = useMemo(() => getRegistroUpdateKey(registro), [registro]);
    const dados = useMemo(() => montarDados(registro), [registroUpdateKey]);
    const legadoLuzUrl = useMemo(() => getLegadoLuzUrl(registro), [registroUpdateKey]);
    const fraseA4Final = useMemo(() => {
        if (fraseA4Selecionada === "personalizada") {
            return fraseA4Personalizada.trim();
        }

        return FRASES_A4[Number(fraseA4Selecionada)] || FRASES_A4[0];
    }, [fraseA4Selecionada, fraseA4Personalizada]);

    useEffect(() => {
        if (!legadoLuzUrl) {
            setIncluirQrLegado(false);
        }
    }, [legadoLuzUrl]);

    useEffect(() => {
        if (!open) return;
        setPreviewSrc("");
        setErro("");
    }, [open, registroUpdateKey]);

    useEffect(() => {
        if (!open) return;

        const t = setTimeout(() => {
            gerarObituario();
        }, 250);

        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        open,
        modelo,
        fotoPretoBranco,
        fontName,
        fontColor,
        incluirQrLegado,
        registroUpdateKey,
    ]);

    useEffect(() => {
        if (!openA4) return;

        const t = setTimeout(() => {
            gerarObituarioA4();
        }, 250);

        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        openA4,
        fraseA4Final,
        fotoPretoBranco,
        fontName,
        fontColor,
        incluirQrLegado,
        registroUpdateKey,
    ]);

    async function desenharFotoOval(
        ctx: CanvasRenderingContext2D,
        fotoSrc: string,
        fotoPB: boolean
    ) {
        if (!fotoSrc) return;

        const img = await carregarImagemParaCanvas(fotoSrc);

        const centerX = 540;
        const centerY = 505;
        const ovalW = 430;
        const ovalH = 640;

        const buffer = document.createElement("canvas");
        buffer.width = ovalW;
        buffer.height = ovalH;

        const bctx = buffer.getContext("2d");
        if (!bctx) throw new Error("Canvas auxiliar não suportado.");

        bctx.save();
        bctx.beginPath();
        bctx.ellipse(
            ovalW / 2,
            ovalH / 2,
            ovalW / 2,
            ovalH / 2,
            0,
            0,
            Math.PI * 2
        );
        bctx.clip();

        const imgRatio = img.width / img.height;
        const boxRatio = ovalW / ovalH;

        let drawW = ovalW;
        let drawH = ovalH;
        let drawX = 0;
        let drawY = 0;

        if (imgRatio > boxRatio) {
            drawH = ovalH;
            drawW = drawH * imgRatio;
            drawX = -(drawW - ovalW) / 2;
        } else {
            drawW = ovalW;
            drawH = drawW / imgRatio;
            drawY = -(drawH - ovalH) / 2;
        }

        bctx.drawImage(img, drawX, drawY, drawW, drawH);

        if (fotoPB) {
            const imageData = bctx.getImageData(0, 0, buffer.width, buffer.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = avg;
                data[i + 1] = avg;
                data[i + 2] = avg;
            }

            bctx.putImageData(imageData, 0, 0);
        }

        bctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            centerY,
            ovalW / 2,
            ovalH / 2,
            0,
            0,
            Math.PI * 2
        );
        ctx.clip();
        ctx.drawImage(buffer, centerX - ovalW / 2, centerY - ovalH / 2);
        ctx.restore();
    }


    async function desenharFotoOvalA4(
        ctx: CanvasRenderingContext2D,
        fotoSrc: string,
        fotoPB: boolean
    ) {
        if (!fotoSrc) return;

        const img = await carregarImagemParaCanvas(fotoSrc);

        const { centerX, centerY, ovalW, ovalH } = POSICOES_A4.foto;

        const buffer = document.createElement("canvas");
        buffer.width = ovalW;
        buffer.height = ovalH;

        const bctx = buffer.getContext("2d");
        if (!bctx) throw new Error("Canvas auxiliar não suportado.");

        bctx.save();
        bctx.beginPath();
        bctx.ellipse(
            ovalW / 2,
            ovalH / 2,
            ovalW / 2,
            ovalH / 2,
            0,
            0,
            Math.PI * 2
        );
        bctx.clip();

        const imgRatio = img.width / img.height;
        const boxRatio = ovalW / ovalH;

        let drawW = ovalW;
        let drawH = ovalH;
        let drawX = 0;
        let drawY = 0;

        if (imgRatio > boxRatio) {
            drawH = ovalH;
            drawW = drawH * imgRatio;
            drawX = -(drawW - ovalW) / 2;
        } else {
            drawW = ovalW;
            drawH = drawW / imgRatio;
            drawY = -(drawH - ovalH) / 2;
        }

        bctx.drawImage(img, drawX, drawY, drawW, drawH);

        if (fotoPB) {
            const imageData = bctx.getImageData(0, 0, buffer.width, buffer.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = avg;
                data[i + 1] = avg;
                data[i + 2] = avg;
            }

            bctx.putImageData(imageData, 0, 0);
        }

        bctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            centerY,
            ovalW / 2,
            ovalH / 2,
            0,
            0,
            Math.PI * 2
        );
        ctx.clip();
        ctx.drawImage(buffer, centerX - ovalW / 2, centerY - ovalH / 2);
        ctx.restore();
    }

    async function gerarObituario() {
        if (!registro) {
            setErro("Nenhum atendimento selecionado.");
            return;
        }

        if (!dados.nome) {
            setErro("O atendimento não possui nome do falecido.");
            return;
        }

        try {
            setLoading(true);
            setErro("");
            setPreviewSrc("");

            await ensureFontLoaded(fontName || "Nunito");

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("Canvas não suportado neste navegador.");
            }

            canvas.width = 1080;
            canvas.height = 1920;

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const deveDesenharQrLegado = incluirQrLegado && !!legadoLuzUrl;
            const bg = await loadImage(getModeloSrc(modelo, deveDesenharQrLegado));
            ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

            const selectedFont = fontName || "Nunito";
            const selectedColor = fontColor || "#111827";

            if (dados.foto_falecido) {
                try {
                    await desenharFotoOval(ctx, dados.foto_falecido, fotoPretoBranco);
                } catch (e) {
                    console.warn("Não foi possível carregar a foto do falecido:", e);
                }
            }

            ctx.fillStyle = selectedColor;
            ctx.textAlign = "center";
            ctx.font = `700 44px "${selectedFont}"`;

            drawWrapText(ctx, dados.nome, canvas.width / 2, 900, 820, 52, "center");

            ctx.font = `600 30px "${selectedFont}"`;
            ctx.fillStyle = selectedColor;
            ctx.textAlign = "left";

            if (dados.data_nascimento) {
                ctx.fillText(dados.data_nascimento, 210, 990);
            }

            if (dados.data_falecimento) {
                ctx.fillText(dados.data_falecimento, 685, 990);
            }

            // Nota de pesar no espaço vazio abaixo das datas
            if (dados.nota_pesar) {
                ctx.fillStyle = selectedColor;
                ctx.textAlign = "center";
                ctx.font = `700 29px "${selectedFont}"`;

                drawWrapText(
                    ctx,
                    dados.nota_pesar,
                    canvas.width / 2,
                    1098,
                    860,
                    34,
                    "center"
                );
            }

            const INFO_X = 340;
            const HORA_X = 575;

            const CERIMONIA_LINHA_Y = 1244;
            const CERIMONIA_LOCAL_Y = 1298;
            const SEPULTAMENTO_LINHA_Y = 1512;
            const SEPULTAMENTO_LOCAL_Y = 1566;

            ctx.fillStyle = selectedColor;
            ctx.font = `600 27px "${selectedFont}"`;
            ctx.textAlign = "left";

            // Cerimônia de despedida:
            // data e horário ficam na mesma linha.
            // O horário usa somente a hora de início, posicionado à frente do ícone do relógio.
            if (dados.data_cerimonia) {
                ctx.fillText(dados.data_cerimonia, INFO_X, CERIMONIA_LINHA_Y);
            }

            if (dados.velorio_inicio) {
                ctx.fillText(dados.velorio_inicio, HORA_X, CERIMONIA_LINHA_Y);
            }

            // O local passa para a linha onde antes ficava o horário.
            if (dados.local_cerimonia) {
                drawWrapText(
                    ctx,
                    dados.local_cerimonia,
                    INFO_X,
                    CERIMONIA_LOCAL_Y,
                    560,
                    31,
                    "left"
                );
            }

            ctx.fillStyle = selectedColor;
            ctx.font = `600 27px "${selectedFont}"`;
            ctx.textAlign = "left";

            // Sepultamento:
            // data e horário ficam na mesma linha.
            // O local passa para a linha onde antes ficava a hora.
            if (dados.data_sepultamento) {
                ctx.fillText(dados.data_sepultamento, INFO_X, SEPULTAMENTO_LINHA_Y);
            }

            if (dados.hora_sepultamento) {
                ctx.fillText(dados.hora_sepultamento, HORA_X, SEPULTAMENTO_LINHA_Y);
            }

            if (dados.local_sepultamento) {
                drawWrapText(
                    ctx,
                    dados.local_sepultamento,
                    INFO_X,
                    SEPULTAMENTO_LOCAL_Y,
                    deveDesenharQrLegado ? 320 : 560,
                    31,
                    "left"
                );
            }

            if (dados.transmissao_inicio_data && dados.transmissao_inicio_hora) {
                ctx.fillStyle = selectedColor;
                ctx.font = `500 22px "${selectedFont}"`;
                ctx.textAlign = "left";

                drawWrapText(
                    ctx,
                    "Transmissão Online: Informações e senha com familiares",
                    110,
                    1742,
                    deveDesenharQrLegado ? 560 : 850,
                    27,
                    "left"
                );

                let linha = `Início: ${dados.transmissao_inicio_data} ${dados.transmissao_inicio_hora}`;

                if (dados.transmissao_fim_data && dados.transmissao_fim_hora) {
                    linha += ` | Fim: ${dados.transmissao_fim_data} ${dados.transmissao_fim_hora}`;
                }

                drawWrapText(
                    ctx,
                    linha,
                    110,
                    1800,
                    deveDesenharQrLegado ? 560 : 850,
                    27,
                    "left"
                );
            }

            if (deveDesenharQrLegado) {
                await desenharQrLegadoLuz(
                    ctx,
                    legadoLuzUrl,
                    QR_POSITIONS[modelo]
                );
            }

            setPreviewSrc(canvas.toDataURL("image/jpeg", 0.92));
        } catch (e: any) {
            console.error(e);
            setErro(e?.message || "Não foi possível gerar o obituário.");
        } finally {
            setLoading(false);
        }
    }


    async function gerarObituarioA4(): Promise<string> {
        if (!registro) {
            setErroA4("Nenhum atendimento selecionado.");
            return "";
        }

        if (!dados.nome) {
            setErroA4("O atendimento não possui nome do falecido.");
            return "";
        }

        if (!fraseA4Final) {
            setErroA4("Selecione uma frase ou escreva uma mensagem personalizada.");
            return "";
        }

        try {
            setLoadingA4(true);
            setErroA4("");
            setPreviewA4Src("");

            await ensureFontLoaded(fontName || "Nunito");

            const deveDesenharQrLegado = incluirQrLegado && !!legadoLuzUrl;
            const bg = await loadImage(getModeloA4Src(deveDesenharQrLegado));
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("Canvas não suportado neste navegador.");
            }

            canvas.width = A4_EXPORT_WIDTH;
            canvas.height = A4_EXPORT_HEIGHT;

            const scaleX = A4_EXPORT_WIDTH / A4_DESIGN_WIDTH;
            const scaleY = A4_EXPORT_HEIGHT / A4_DESIGN_HEIGHT;

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // A partir daqui, tudo no A4 usa as coordenadas do layout original,
            // mas a imagem final exportada sai em tamanho/proporção real A4.
            ctx.save();
            ctx.scale(scaleX, scaleY);
            ctx.drawImage(bg, 0, 0, A4_DESIGN_WIDTH, A4_DESIGN_HEIGHT);

            const selectedFont = fontName || "Nunito";
            const selectedColor = fontColor || "#111827";

            // Mensagem personalizada ou predefinida abaixo da linha da logo.
            ctx.fillStyle = selectedColor;
            ctx.textAlign = "center";
            ctx.font = `600 21px "${selectedFont}"`;
            drawWrapText(
                ctx,
                fraseA4Final,
                POSICOES_A4.mensagem.x,
                POSICOES_A4.mensagem.y,
                POSICOES_A4.mensagem.maxWidth,
                POSICOES_A4.mensagem.lineHeight,
                "center"
            );

            // Foto oval do falecido no bloco superior esquerdo.
            if (dados.foto_falecido) {
                try {
                    await desenharFotoOvalA4(ctx, dados.foto_falecido, fotoPretoBranco);
                } catch (e) {
                    console.warn("Não foi possível carregar a foto do falecido no A4:", e);
                }
            }

            // Nome do falecido à direita da foto, exclusivo do A4.
            // A primeira linha tenta manter nome e sobrenome juntos.
            // Se houver mais palavras, elas caem para a segunda linha.
            const nomeA4 = montarLinhasNomeA4(
                ctx,
                dados.nome,
                POSICOES_A4.nome.maxWidth,
                POSICOES_A4.nome.fontSize,
                POSICOES_A4.nome.minFontSize,
                selectedFont
            );

            ctx.fillStyle = selectedColor;
            ctx.textAlign = "left";
            ctx.font = `800 ${nomeA4.fontSize}px "${selectedFont}"`;

            nomeA4.lines.forEach((line, index) => {
                ctx.fillText(
                    line,
                    POSICOES_A4.nome.x,
                    POSICOES_A4.nome.y + index * POSICOES_A4.nome.lineHeight
                );
            });

            const ultimaLinhaNomeY =
                POSICOES_A4.nome.y +
                (nomeA4.lines.length - 1) * POSICOES_A4.nome.lineHeight;

            const separadorNomeDataY =
                ultimaLinhaNomeY + POSICOES_A4.separadorNomeData.yOffset;

            desenharLinhaSeparadoraA4(
                ctx,
                POSICOES_A4.separadorNomeData.x,
                separadorNomeDataY,
                POSICOES_A4.separadorNomeData.w,
                selectedColor
            );

            const datasA4Y = separadorNomeDataY + POSICOES_A4.datas.yOffset;

            // Datas de nascimento e falecimento abaixo do nome, com distância fixa.
            ctx.fillStyle = selectedColor;
            ctx.font = `700 28px "${selectedFont}"`;
            ctx.textAlign = "left";

            if (dados.data_nascimento) {
                ctx.fillText(
                    dados.data_nascimento,
                    POSICOES_A4.datas.x,
                    datasA4Y
                );
            }

            if (dados.data_falecimento) {
                ctx.fillText(
                    dados.data_falecimento,
                    POSICOES_A4.datas.x + POSICOES_A4.datas.gapX,
                    datasA4Y
                );
            }

            // A4: por solicitação, não renderiza informações de cerimônia e sepultamento.

            // QR Code no quadro inferior esquerdo.
            if (deveDesenharQrLegado) {
                await desenharQrLegadoLuzA4(ctx, legadoLuzUrl, POSICOES_A4.qr);
            }

            ctx.restore();

            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            setPreviewA4Src(dataUrl);
            return dataUrl;
        } catch (e: any) {
            console.error(e);
            setErroA4(e?.message || "Não foi possível gerar o obituário A4.");
            return "";
        } finally {
            setLoadingA4(false);
        }
    }

    function abrirModalA4() {
        setOpenA4(true);
        setErroA4("");
        setPreviewA4Src("");
    }

    async function baixarObituarioA4() {
        const src = previewA4Src || (await gerarObituarioA4());

        if (!src) return;

        const sufixo = incluirQrLegado && !!legadoLuzUrl ? "a4-com-qr" : "a4-sem-qr";
        const pdf = criarPdfA4ComImagem(src);

        baixarBlob(pdf, `${nomeArquivoSeguro(dados.nome)}-obituario-${sufixo}.pdf`);
    }

    function baixarObituario() {
        if (!previewSrc) return;

        const a = document.createElement("a");
        a.href = previewSrc;
        const sufixo = incluirQrLegado && !!legadoLuzUrl ? "com-qr" : "sem-qr";
        a.download = `${nomeArquivoSeguro(dados.nome)}-obituario-${sufixo}.jpg`;
        a.click();
    }

    return (
        <>
            <button
                type="button"
                className="w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                onClick={() => setOpen(true)}
            >
                Enviar Obituário
            </button>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                ariaLabel="Enviar Obituário"
                maxWidth={1180}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold">Enviar Obituário</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {dados.nome || "Atendimento selecionado"}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setOpen(false)}
                    >
                        <IconX className="size-4" />
                    </button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-4">
                        <div className="rounded-xl border bg-card/60 p-4">
                            <h3 className="font-semibold">Dados puxados do atendimento</h3>

                            <div className="mt-3 space-y-2 text-sm">
                                <InfoLinha label="Falecido(a)" value={dados.nome} />
                                <InfoLinha label="Nascimento" value={dados.data_nascimento} />
                                <InfoLinha label="Falecimento" value={dados.data_falecimento} />
                                <InfoLinha
                                    label="Local do Velório"
                                    value={dados.local_cerimonia}
                                />
                                <InfoLinha
                                    label="Velório"
                                    value={`${dados.data_cerimonia || "-"} ${dados.velorio_inicio || ""
                                        } até ${dados.fim_data_cerimonia || "-"} ${dados.velorio_fim || ""
                                        }`}
                                />
                                <InfoLinha
                                    label="Sepultamento"
                                    value={`${dados.data_sepultamento || "-"} ${dados.hora_sepultamento || ""
                                        }`}
                                />
                                <InfoLinha
                                    label="Local Sepultamento"
                                    value={dados.local_sepultamento}
                                />
                                <InfoLinha label="Nota de Pesar" value={dados.nota_pesar} />
                                <InfoLinha
                                    label="Legado de Luz"
                                    value={
                                        legadoLuzUrl ||
                                        "Sem ID/link do Legado retornado no atendimento"
                                    }
                                />
                            </div>

                            {dados.foto_falecido ? (
                                <div className="mt-4 flex items-center gap-3">
                                    <img
                                        src={dados.foto_falecido}
                                        alt="Foto do falecido"
                                        className="h-16 w-16 rounded-lg border object-cover"
                                        onError={(e) => {
                                            console.warn(
                                                "Erro ao carregar miniatura:",
                                                dados.foto_falecido
                                            );
                                            e.currentTarget.style.display = "none";
                                        }}
                                    />
                                    <div className="text-xs text-muted-foreground">
                                        <IconPhoto className="mb-1 size-4" />
                                        Foto carregada do atendimento.
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                    Este atendimento não possui foto cadastrada.
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border bg-card/60 p-4">
                            <h3 className="font-semibold">Modelos</h3>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                {MODELOS_OPTIONS.map((m) => (
                                    <button
                                        key={m.value}
                                        type="button"
                                        className={`rounded-lg border p-2 text-left text-xs transition hover:bg-muted ${modelo === m.value
                                            ? "border-blue-600 ring-2 ring-blue-200"
                                            : ""
                                            }`}
                                        onClick={() => setModelo(m.value)}
                                    >
                                        <img
                                            src={getModeloSrc(m.value, incluirQrLegado && !!legadoLuzUrl)}
                                            alt={m.label}
                                            className="mb-2 aspect-[9/16] w-full rounded-md border object-cover"
                                        />
                                        <span className="font-medium">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-xl border bg-card/60 p-4">
                            <h3 className="font-semibold">Ajustes</h3>

                            <label className="mt-3 flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={fotoPretoBranco}
                                    onChange={(e) => setFotoPretoBranco(e.target.checked)}
                                />
                                Foto em preto e branco
                            </label>

                            <label className="mt-3 flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={incluirQrLegado}
                                    onChange={(e) => setIncluirQrLegado(e.target.checked)}
                                    disabled={!legadoLuzUrl}
                                />
                                Legado de Luz
                            </label>

                            {legadoLuzUrl && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Marque para usar os modelos QR1 a QR8 e mostrar o QR Code no obituário e no A4.
                                </p>
                            )}

                            {!legadoLuzUrl && (
                                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    O QR Code só aparece quando o atendimento retorna ID ou
                                    link do Legado de Luz.
                                </div>
                            )}

                            <label className="mt-3 block text-sm">
                                Fonte
                                <select
                                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                                    value={fontName}
                                    onChange={(e) => setFontName(e.target.value)}
                                >
                                    <option value="Nunito">Nunito</option>
                                    <option value="Roboto">Roboto</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">
                                        Times New Roman
                                    </option>
                                </select>
                            </label>

                            <label className="mt-3 block text-sm">
                                Cor da Fonte
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border">
                                        <IconPalette className="size-5 opacity-70" />
                                    </span>
                                    <input
                                        type="color"
                                        className="h-10 w-full cursor-pointer rounded-md border bg-transparent p-1"
                                        value={fontColor}
                                        onChange={(e) => setFontColor(e.target.value)}
                                    />
                                </div>
                            </label>

                            <button
                                type="button"
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                                onClick={gerarObituario}
                                disabled={loading}
                            >
                                <IconRefresh
                                    className={`size-4 ${loading ? "animate-spin" : ""}`}
                                />
                                {loading ? "Gerando..." : "Atualizar pré-visualização"}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card/60 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-semibold">Pré-visualização</h3>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                                    onClick={baixarObituario}
                                    disabled={!previewSrc || loading}
                                >
                                    <IconDownload className="size-4" />
                                    Baixar Obituário
                                </button>

                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-md bg-[#039adc] px-3 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60"
                                    onClick={abrirModalA4}
                                    disabled={!registro}
                                >
                                    <IconDownload className="size-4" />
                                    Baixar A4
                                </button>
                            </div>
                        </div>

                        {erro ? (
                            <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                                {erro}
                            </div>
                        ) : null}

                        {loading ? (
                            <div className="grid min-h-[620px] place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
                                Gerando obituário...
                            </div>
                        ) : previewSrc ? (
                            <img
                                src={previewSrc}
                                alt="Pré-visualização do obituário"
                                className="mx-auto block w-full max-w-[430px] rounded-md border object-contain"
                            />
                        ) : (
                            <div className="grid min-h-[620px] place-items-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                A pré-visualização será gerada automaticamente.
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={openA4}
                onClose={() => setOpenA4(false)}
                ariaLabel="Baixar Obituário A4"
                maxWidth={1180}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold">Baixar A4</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {dados.nome || "Atendimento selecionado"}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setOpenA4(false)}
                    >
                        <IconX className="size-4" />
                    </button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[420px_1fr]">
                    <div className="space-y-4">
                        <div className="rounded-xl border bg-card/60 p-4">
                            <h3 className="font-semibold">Mensagem do A4</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Escolha uma frase predefinida ou use uma mensagem personalizada.
                            </p>

                            <label className="mt-4 flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={incluirQrLegado}
                                    onChange={(e) => setIncluirQrLegado(e.target.checked)}
                                    disabled={!legadoLuzUrl}
                                />
                                Legado de Luz
                            </label>

                            {legadoLuzUrl ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Marque para usar o A4QR1 e mostrar o QR Code no A4.
                                </p>
                            ) : (
                                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    O QR Code só aparece quando o atendimento retorna ID ou
                                    link do Legado de Luz.
                                </div>
                            )}

                            <label className="mt-4 block text-sm">
                                Frase
                                <select
                                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                                    value={fraseA4Selecionada}
                                    onChange={(e) => setFraseA4Selecionada(e.target.value)}
                                >
                                    {FRASES_A4.map((frase, index) => (
                                        <option key={index} value={String(index)}>
                                            {`Frase ${index + 1}`}
                                        </option>
                                    ))}
                                    <option value="personalizada">Mensagem personalizada</option>
                                </select>
                            </label>

                            {fraseA4Selecionada === "personalizada" ? (
                                <label className="mt-4 block text-sm">
                                    Escreva a mensagem personalizada
                                    <textarea
                                        className="mt-1 min-h-[170px] w-full rounded-md border px-3 py-2 text-sm"
                                        value={fraseA4Personalizada}
                                        onChange={(e) => setFraseA4Personalizada(e.target.value)}
                                        placeholder="Digite a mensagem que aparecerá abaixo da logo."
                                    />
                                </label>
                            ) : (
                                <div className="mt-4 rounded-md border bg-background/60 px-3 py-2 text-sm leading-relaxed">
                                    {fraseA4Final}
                                </div>
                            )}

                            {erroA4 ? (
                                <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                                    {erroA4}
                                </div>
                            ) : null}

                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                                    onClick={gerarObituarioA4}
                                    disabled={loadingA4}
                                >
                                    <IconRefresh className={`size-4 ${loadingA4 ? "animate-spin" : ""}`} />
                                    {loadingA4 ? "Gerando..." : "Atualizar A4"}
                                </button>

                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#039adc] px-3 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60"
                                    onClick={baixarObituarioA4}
                                    disabled={loadingA4}
                                >
                                    <IconDownload className="size-4" />
                                    Baixar A4
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card/60 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-semibold">Pré-visualização A4</h3>
                        </div>

                        {loadingA4 && (
                            <div className="grid min-h-[620px] place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
                                Gerando A4...
                            </div>
                        )}

                        {!loadingA4 && previewA4Src && (
                            <img
                                src={previewA4Src}
                                alt="Pré-visualização do obituário A4"
                                className="mx-auto block w-full max-w-[520px] rounded-md border object-contain"
                            />
                        )}

                        {!loadingA4 && !previewA4Src && (
                            <div className="grid min-h-[620px] place-items-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                A pré-visualização A4 será gerada automaticamente.
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </>
    );
}

function InfoLinha({
    label,
    value,
}: {
    label: string;
    value?: string;
}) {
    return (
        <div className="rounded-md border bg-background/60 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
            </div>
            <div className="mt-0.5 break-words text-sm font-medium">
                {value || "-"}
            </div>
        </div>
    );
}
