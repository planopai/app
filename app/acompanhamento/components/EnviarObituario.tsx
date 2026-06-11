"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    IconDownload,
    IconPhoto,
    IconRefresh,
    IconPalette,
    IconX,
} from "@tabler/icons-react";
import Modal from "./Modal";
import type { Registro } from "./types";

type ModeloKey =
    | "modelo01"
    | "modelo02"
    | "modelo03"
    | "modelo04"
    | "modelo05"
    | "modelo06"
    | "modelo07"
    | "modelo08"
    | "modelo09";

const NOTA_PESAR_FIXA = "Eternas Saudades de Seus Familiares e Amigos.";

const MODELOS: Record<ModeloKey, string> = {
    modelo01: "/obituario-modelos/MM1.png",
    modelo02: "/obituario-modelos/MM2.png",
    modelo03: "/obituario-modelos/M3.png",
    modelo04: "/obituario-modelos/M4.png",
    modelo05: "/obituario-modelos/F1.png",
    modelo06: "/obituario-modelos/F2.png",
    modelo07: "/obituario-modelos/F3.png",
    modelo08: "/obituario-modelos/F4.png",
    modelo09: "/obituario-modelos/I1.png",
};

const MODELOS_OPTIONS: Array<{ value: ModeloKey; label: string }> = [
    { value: "modelo01", label: "Masculino 01" },
    { value: "modelo02", label: "Masculino 02" },
    { value: "modelo03", label: "Masculino 03" },
    { value: "modelo04", label: "Masculino 04" },
    { value: "modelo05", label: "Feminino 01" },
    { value: "modelo06", label: "Feminino 02" },
    { value: "modelo07", label: "Feminino 03" },
    { value: "modelo08", label: "Feminino 04" },
    { value: "modelo09", label: "Infantil 01" },
];

const API_BASE = "https://api.planoassistencialintegrado.com.br";

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
        // usa fallback do navegador
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
        img.onerror = () => reject(new Error(`Não foi possível carregar a imagem: ${src}`));
        img.src = src;
    });
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
    const words = String(text || "").split(/\s+/).filter(Boolean);
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
        String((registro as any)?.velorio_online ?? "").trim().toLowerCase() === "sim";

    return {
        nome: pickFirst(
            (registro as any)?.falecido,
            (registro as any)?.nome_completo,
            (registro as any)?.nome_falecido
        ),

        data_nascimento: normalizeDateToBR((registro as any)?.data_nascimento),
        data_falecimento: normalizeDateToBR((registro as any)?.data_falecimento),

        foto_falecido: normalizarFotoUrl(
            pickFirst(
                (registro as any)?.foto_falecido,
                (registro as any)?.foto_url
            )
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

        transmissao_inicio_data: velorioOnline ? normalizeDateToBR(dataInicioVelorio) : "",
        transmissao_inicio_hora: velorioOnline ? normalizeHHMM(horaInicioVelorio) : "",
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

    const [previewSrc, setPreviewSrc] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");

    const dados = useMemo(() => montarDados(registro), [registro]);

    useEffect(() => {
        if (!open) return;
        setPreviewSrc("");
        setErro("");
    }, [open, registro?.id]);

    useEffect(() => {
        if (!open) return;

        const t = setTimeout(() => {
            gerarObituario();
        }, 250);

        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, modelo, fotoPretoBranco, fontName, fontColor, registro?.id]);

    async function desenharFotoCircular(
        ctx: CanvasRenderingContext2D,
        fotoSrc: string,
        fotoPB: boolean
    ) {
        if (!fotoSrc) return;

        const img = await carregarImagemParaCanvas(fotoSrc);

        const radius = 270;
        const x = 1080 / 2;
        const y = 620;

        const buffer = document.createElement("canvas");
        buffer.width = radius * 2;
        buffer.height = radius * 2;

        const bctx = buffer.getContext("2d");
        if (!bctx) throw new Error("Canvas auxiliar não suportado.");

        bctx.save();
        bctx.beginPath();
        bctx.arc(radius, radius, radius, 0, Math.PI * 2);
        bctx.clip();

        const imgRatio = img.width / img.height;
        const boxRatio = 1;

        let drawW = radius * 2;
        let drawH = radius * 2;
        let drawX = 0;
        let drawY = 0;

        if (imgRatio > boxRatio) {
            drawH = radius * 2;
            drawW = drawH * imgRatio;
            drawX = -(drawW - radius * 2) / 2;
        } else {
            drawW = radius * 2;
            drawH = drawW / imgRatio;
            drawY = -(drawH - radius * 2) / 2;
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
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(buffer, x - radius, y - radius);
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

            const bg = await loadImage(MODELOS[modelo]);
            ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

            const selectedFont = fontName || "Nunito";
            const selectedColor = fontColor || "#111827";

            if (dados.foto_falecido) {
                try {
                    await desenharFotoCircular(ctx, dados.foto_falecido, fotoPretoBranco);
                } catch (e) {
                    console.warn("Não foi possível carregar a foto do falecido:", e);
                }
            }

            ctx.fillStyle = selectedColor;
            ctx.font = `30px "${selectedFont}"`;
            ctx.textAlign = "center";
            drawWrapText(ctx, dados.nota_pesar, canvas.width / 2, 200, 800, 34, "center");

            ctx.fillStyle = selectedColor;
            ctx.textAlign = "center";
            ctx.font = `48px "${selectedFont}"`;
            drawWrapText(ctx, dados.nome, canvas.width / 2, 1000, 900, 56, "center");

            ctx.font = `32px "${selectedFont}"`;

            if (dados.data_nascimento) {
                ctx.fillText(dados.data_nascimento, canvas.width / 2 - 180, 1120);
            }

            if (dados.data_falecimento) {
                ctx.fillText(dados.data_falecimento, canvas.width / 2 + 200, 1120);
            }

            ctx.font = `30px "${selectedFont}"`;
            ctx.fillStyle = selectedColor;
            ctx.textAlign = "left";

            ctx.fillText(`Horário de Início: ${dados.velorio_inicio || ""}`, 110, 1360);
            ctx.fillText(`Data: ${dados.data_cerimonia || ""}`, 110, 1390);
            ctx.fillText(`Horário de Término: ${dados.velorio_fim || ""}`, 110, 1420);
            ctx.fillText(`Data: ${dados.fim_data_cerimonia || ""}`, 110, 1450);

            drawWrapText(
                ctx,
                `Local: ${dados.local_cerimonia || ""}`,
                110,
                1480,
                850,
                34,
                "left"
            );

            ctx.textAlign = "left";
            ctx.font = `30px "${selectedFont}"`;

            ctx.fillText(`Data: ${dados.data_sepultamento || ""}`, 110, 1610);
            ctx.fillText(`Hora: ${dados.hora_sepultamento || ""}`, 110, 1640);

            drawWrapText(
                ctx,
                `Local: ${dados.local_sepultamento || ""}`,
                110,
                1670,
                850,
                34,
                "left"
            );

            if (dados.transmissao_inicio_data && dados.transmissao_inicio_hora) {
                ctx.textAlign = "center";
                ctx.font = `28px "${selectedFont}"`;

                let baseY = 1750;

                ctx.fillText(
                    "Transmissão Online: Informações e senha com familiares",
                    canvas.width / 2,
                    baseY
                );

                baseY += 34;

                let linha = `Início: ${dados.transmissao_inicio_data} ${dados.transmissao_inicio_hora}`;

                if (dados.transmissao_fim_data && dados.transmissao_fim_hora) {
                    linha += ` | Fim: ${dados.transmissao_fim_data} ${dados.transmissao_fim_hora}`;
                }

                ctx.fillText(linha, canvas.width / 2, baseY);
            }

            setPreviewSrc(canvas.toDataURL("image/jpeg", 0.92));
        } catch (e: any) {
            console.error(e);
            setErro(e?.message || "Não foi possível gerar o obituário.");
        } finally {
            setLoading(false);
        }
    }

    function baixarObituario() {
        if (!previewSrc) return;

        const a = document.createElement("a");
        a.href = previewSrc;
        a.download = `${nomeArquivoSeguro(dados.nome)}-obituario.jpg`;
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

            <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Enviar Obituário" maxWidth={1180}>
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
                                <InfoLinha label="Local do Velório" value={dados.local_cerimonia} />
                                <InfoLinha
                                    label="Velório"
                                    value={`${dados.data_cerimonia || "-"} ${dados.velorio_inicio || ""} até ${dados.fim_data_cerimonia || "-"} ${dados.velorio_fim || ""}`}
                                />
                                <InfoLinha
                                    label="Sepultamento"
                                    value={`${dados.data_sepultamento || "-"} ${dados.hora_sepultamento || ""}`}
                                />
                                <InfoLinha label="Local Sepultamento" value={dados.local_sepultamento} />
                                <InfoLinha label="Nota de Pesar" value={dados.nota_pesar} />
                            </div>

                            {dados.foto_falecido ? (
                                <div className="mt-4 flex items-center gap-3">
                                    <img
                                        src={dados.foto_falecido}
                                        alt="Foto do falecido"
                                        crossOrigin="anonymous"
                                        className="h-16 w-16 rounded-lg border object-cover"
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
                                        className={`rounded-lg border p-2 text-left text-xs transition hover:bg-muted ${modelo === m.value ? "border-blue-600 ring-2 ring-blue-200" : ""
                                            }`}
                                        onClick={() => setModelo(m.value)}
                                    >
                                        <img
                                            src={MODELOS[m.value]}
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
                                    <option value="Times New Roman">Times New Roman</option>
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
                                <IconRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} />
                                {loading ? "Gerando..." : "Atualizar pré-visualização"}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card/60 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-semibold">Pré-visualização</h3>

                            <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                                onClick={baixarObituario}
                                disabled={!previewSrc || loading}
                            >
                                <IconDownload className="size-4" />
                                Baixar Obituário
                            </button>
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