"use client";

import React, { useMemo, useRef, useState } from "react";
import {
    IconChevronLeft,
    IconChevronRight,
    IconDownload,
    IconSettings,
    IconPhoto,
    IconColorSwatch,
    IconX,
} from "@tabler/icons-react";

type Formato = "vertical";
type ModeloKey =
    | "modelo01" | "modelo02" | "modelo03" | "modelo04"
    | "modelo05" | "modelo06" | "modelo07" | "modelo08"
    | "modelo09" | "modelo010" | "modelo011" | "modelo012"
    | "personalizado";

const MODELOS: Record<Exclude<ModeloKey, "personalizado">, string> = {
    modelo01: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/MM1.png",
    modelo02: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/MM2.png",
    modelo03: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/M3.png",
    modelo04: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/M4.png",
    modelo05: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/F1.png",
    modelo06: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/F2.png",
    modelo07: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/F3.png",
    modelo08: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/F4.png",
    modelo09: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/I1.png",
    modelo010: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/I2.png",
    modelo011: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/I3.png",
    modelo012: "https://planoassistencialintegrado.com.br/wp-content/uploads/2024/10/I4.png",
};

function formatDateBr(d?: string) {
    if (!d) return "";
    const dt = new Date(d);
    const day = String(dt.getUTCDate()).padStart(2, "0");
    const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const year = dt.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

export default function ObituarioPage() {
    const formRef = useRef<HTMLFormElement>(null);
    const [step, setStep] = useState(0);

    // preview
    const [previewSrc, setPreviewSrc] = useState<string>("");

    // settings modal
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [fontName, setFontName] = useState<string>(
        typeof window !== "undefined" ? localStorage.getItem("fontName") || "Nunito" : "Nunito",
    );
    const [fontColor, setFontColor] = useState<string>(
        typeof window !== "undefined" ? localStorage.getItem("fontColor") || "#000000" : "#000000",
    );

    const stepsTotal = 5;
    const isFirst = step === 0;
    const isLast = step === stepsTotal - 1;

    const modelosOptions = useMemo(
        () =>
            [
                { value: "modelo01", label: "Masculino Rede Social 01" },
                { value: "modelo02", label: "Masculino Rede Social 02" },
                { value: "modelo03", label: "Masculino Rede Social 03" },
                { value: "modelo04", label: "Masculino Rede Social 04" },
                { value: "modelo05", label: "Feminino Rede Social 01" },
                { value: "modelo06", label: "Feminino Rede Social 02" },
                { value: "modelo07", label: "Feminino Rede Social 03" },
                { value: "modelo08", label: "Feminino Rede Social 04" },
                { value: "modelo09", label: "Infantil Rede Social 01" },
                { value: "modelo010", label: "Infantil Rede Social 02" },
                { value: "modelo011", label: "Infantil Rede Social 03" },
                { value: "modelo012", label: "Infantil Rede Social 04" },
                { value: "personalizado", label: "Enviar Modelo" },
            ] as { value: ModeloKey; label: string }[],
        [],
    );

    function handlePrev() {
        if (!isFirst) setStep((s) => s - 1);
    }
    function handleNext() {
        if (!isLast) setStep((s) => s + 1);
    }

    function applySettings() {
        localStorage.setItem("fontName", fontName);
        localStorage.setItem("fontColor", fontColor);
        setSettingsOpen(false);
    }

    async function generate() {
        const form = formRef.current;
        if (!form) return;
        const fd = new FormData(form);

        const formato = (fd.get("formato") as Formato) || "vertical";
        const modelo = (fd.get("modelo_fundo") as ModeloKey) || "modelo01";

        let bgUrl = MODELOS["modelo01"];
        if (modelo === "personalizado") {
            const file = fd.get("fundo_personalizado") as File;
            if (!file || !file.size) {
                alert("Envie um modelo de fundo personalizado.");
                return;
            }
            bgUrl = await fileToDataURL(file);
        } else {
            bgUrl = MODELOS[modelo as keyof typeof MODELOS] ?? MODELOS["modelo01"];
        }

        // Canvas base
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // somente vertical (como no HTML original)
        if (formato === "vertical") {
            canvas.width = 1080;
            canvas.height = 1920;
        } else {
            canvas.width = 928;
            canvas.height = 824;
        }

        // desenha fundo
        const bg = await loadImage(bgUrl);
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

        // helpers
        const nome = String(fd.get("nome") || "");
        const dataNasc = formatDateBr(String(fd.get("data_nascimento") || ""));
        const dataFal = formatDateBr(String(fd.get("data_falecimento") || ""));
        const velorioInicio = String(fd.get("velorio_inicio") || "");
        const velorioFim = String(fd.get("velorio_fim") || "");
        const dataCerimonia = formatDateBr(String(fd.get("data_cerimonia") || ""));
        const fimDataCer = formatDateBr(String(fd.get("fim_data_cerimonia") || ""));
        const localCer = String(fd.get("local_cerimonia") || "");
        const dataSep = formatDateBr(String(fd.get("data_sepultamento") || ""));
        const horaSep = String(fd.get("hora_sepultamento") || "");
        const localSep = String(fd.get("local_sepultamento") || "");
        const nota = String(fd.get("nota_pesar") || "");

        const tInicioData = String(fd.get("transmissao_inicio_data") || "");
        const tInicioHora = String(fd.get("transmissao_inicio_hora") || "");
        const tFimData = String(fd.get("transmissao_fim_data") || "");
        const tFimHora = String(fd.get("transmissao_fim_hora") || "");

        const foto = fd.get("foto_falecido") as File | null;
        const pretoBranco = fd.get("foto_preto_branco") === "on";

        // fontes
        const _fontName = localStorage.getItem("fontName") || "Nunito";
        const _fontColor = localStorage.getItem("fontColor") || "#FFFFFF";
        const fontSizeName = formato === "vertical" ? 45 : 40;
        const fontSizeDetails = formato === "vertical" ? 30 : 25;
        const fontSizeNote = formato === "vertical" ? 30 : 25;

        // nome
        ctx.fillStyle = _fontColor;
        ctx.textAlign = "center";
        ctx.font = `${fontSizeName}px ${_fontName}`;
        if (formato === "vertical") ctx.fillText(nome, canvas.width / 2, 1000);
        else ctx.fillText(nome, canvas.width / 2, 80);

        // datas
        ctx.font = `${fontSizeDetails}px ${_fontName}`;
        if (formato === "vertical") {
            ctx.fillText(`${dataNasc}`, canvas.width / 2 - 180, 1120);
            ctx.fillText(`${dataFal}`, canvas.width / 2 + 200, 1120);
        } else {
            ctx.fillText(`${dataNasc}`, canvas.width / 2 - 110, 140);
            ctx.fillText(`${dataFal}`, canvas.width / 2 + 120, 140);
        }

        // foto circular
        if (foto && foto.size) {
            const imgURL = URL.createObjectURL(foto);
            const img = await loadImage(imgURL);
            const radius = formato === "vertical" ? 270 : 130;
            const x = formato === "vertical" ? canvas.width / 2 : 150;
            const y = formato === "vertical" ? 620 : 345;

            const buff = document.createElement("canvas");
            buff.width = buff.height = radius * 2;
            const bctx = buff.getContext("2d")!;
            bctx.save();
            bctx.beginPath();
            bctx.arc(radius, radius, radius, 0, Math.PI * 2);
            bctx.clip();
            bctx.drawImage(img, 0, 0, radius * 2, radius * 2);

            if (pretoBranco) {
                const id = bctx.getImageData(0, 0, buff.width, buff.height);
                const d = id.data;
                for (let i = 0; i < d.length; i += 4) {
                    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
                    d[i] = avg;
                    d[i + 1] = avg;
                    d[i + 2] = avg;
                }
                bctx.putImageData(id, 0, 0);
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(buff, x - radius, y - radius);
            ctx.restore();
        }

        // nota de pesar (wrap)
        ctx.textAlign = "center";
        ctx.font = `${fontSizeNote}px ${_fontName}`;
        ctx.fillStyle = _fontColor;

        const maxLineWidth = formato === "vertical" ? 800 : 400;
        const lineHeight = 30;
        const startY = formato === "vertical" ? 200 : 270;
        if (nota) {
            if (formato === "vertical") {
                drawWrapText(ctx, nota, canvas.width / 2, startY, maxLineWidth, lineHeight, "center");
            } else {
                drawWrapText(ctx, nota, canvas.width - 50, startY, maxLineWidth, lineHeight, "right");
            }
        }

        // blocos: velório / sepultamento
        ctx.font = `${fontSizeNote}px ${_fontName}`;
        ctx.fillStyle = _fontColor;

        if (formato === "vertical") {
            ctx.textAlign = "left";
            ctx.fillText(`Horário de Início: ${velorioInicio}`, 110, 1360);
            ctx.fillText(`Data: ${dataCerimonia}`, 110, 1390);
            ctx.fillText(`Horário de Término: ${velorioFim}`, 110, 1420);
            ctx.fillText(`Data: ${fimDataCer}`, 110, 1450);
            ctx.fillText(`Local: ${localCer}`, 110, 1480);

            ctx.textAlign = "left";
            ctx.fillText(`Data: ${dataSep}`, canvas.width - 970, 1610);
            ctx.fillText(`Hora: ${horaSep}`, canvas.width - 970, 1640);
            ctx.fillText(`Local: ${localSep}`, canvas.width - 970, 1670);
        } else {
            ctx.textAlign = "left";
            ctx.fillText(`Horário de Início: ${velorioInicio}`, 48, 602);
            ctx.fillText(`Data: ${dataCerimonia}`, 48, 632);
            ctx.fillText(`Horário de Término: ${velorioFim}`, 48, 662);
            ctx.fillText(`Data: ${fimDataCer}`, 48, 692);
            ctx.fillText(`Local: ${localCer}`, 48, 722);

            ctx.textAlign = "right";
            ctx.fillText(`Data: ${dataSep}`, canvas.width - 50, 602);
            ctx.fillText(`Hora: ${horaSep}`, canvas.width - 50, 632);
            ctx.fillText(`Local: ${localSep}`, canvas.width - 50, 662);
        }

        // transmissão (rodapé)
        if (tInicioData && tInicioHora) {
            ctx.textAlign = "center";
            let baseY = formato === "vertical" ? 1750 : 760;
            ctx.fillText(`Transmissão Online: Informações e senha com familiares`, canvas.width / 2, baseY);
            baseY += 30;
            let linha = `Início: ${formatDateBr(tInicioData)} ${tInicioHora}`;
            if (tFimData && tFimHora) {
                linha += ` | Fim: ${formatDateBr(tFimData)} ${tFimHora}`;
            }
            ctx.fillText(linha, canvas.width / 2, baseY);
        }

        // preview
        setPreviewSrc(canvas.toDataURL("image/jpeg"));
    }

    function download() {
        if (!previewSrc) return;
        const a = document.createElement("a");
        a.href = previewSrc;
        a.download = "obituario.jpg";
        a.click();
    }

    return (
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Gerar Obituário</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Preencha as etapas, gere a arte e faça o download. Totalmente responsivo.
                </p>
            </header>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* FORM CARD */}
                <div className="rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur sm:p-6">
                    <form ref={formRef} className="space-y-6">
                        {/* STEP 1 */}
                        {step === 0 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Falecido</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Foto do Falecido</label>
                                        <div className="flex items-center gap-3">
                                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                                                <IconPhoto className="size-4" />
                                                <span>Selecionar imagem</span>
                                                <input
                                                    type="file"
                                                    name="foto_falecido"
                                                    accept="image/*"
                                                    required
                                                    className="hidden"
                                                />
                                            </label>

                                            <label className="inline-flex items-center gap-2 text-sm">
                                                <input type="checkbox" name="foto_preto_branco" className="h-4 w-4" />
                                                Preto/Branco
                                            </label>
                                        </div>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Nome</label>
                                        <input name="nome" required className="input" placeholder="Nome completo" />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm">Data de Nascimento</label>
                                        <input type="date" name="data_nascimento" required className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Data de Falecimento</label>
                                        <input type="date" name="data_falecimento" required className="input" />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 2 */}
                        {step === 1 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Velório e Cerimônia</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Local da Cerimônia</label>
                                        <input name="local_cerimonia" required className="input" />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm">Início (Data)</label>
                                        <input type="date" name="data_cerimonia" required className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Velório - Início</label>
                                        <input type="time" name="velorio_inicio" required className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Velório - Fim</label>
                                        <input type="time" name="velorio_fim" required className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Fim (Data)</label>
                                        <input type="date" name="fim_data_cerimonia" required className="input" />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 3 */}
                        {step === 2 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Sepultamento</legend>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm">Data do Sepultamento</label>
                                        <input type="date" name="data_sepultamento" required className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Hora do Sepultamento</label>
                                        <input type="time" name="hora_sepultamento" required className="input" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Local do Sepultamento</label>
                                        <input name="local_sepultamento" required className="input" />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 4 */}
                        {step === 3 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Nota de Pesar e Transmissão</legend>

                                <div>
                                    <label className="mb-1 block text-sm">Nota de Pesar</label>
                                    <textarea name="nota_pesar" rows={4} required className="input" />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm">Transmissão - Início (Data)</label>
                                        <input type="date" name="transmissao_inicio_data" className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Transmissão - Início (Hora)</label>
                                        <input type="time" name="transmissao_inicio_hora" className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Transmissão - Fim (Data)</label>
                                        <input type="date" name="transmissao_fim_data" className="input" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm">Transmissão - Fim (Hora)</label>
                                        <input type="time" name="transmissao_fim_hora" className="input" />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 5 */}
                        {step === 4 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Configurações Finais</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm">Formato</label>
                                        <select name="formato" className="input" defaultValue="vertical">
                                            <option value="vertical">Redes Sociais</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm">Modelo de Fundo</label>
                                        <select name="modelo_fundo" className="input" defaultValue="modelo01" onChange={(e) => {
                                            const v = e.currentTarget.value as ModeloKey;
                                            const el = document.getElementById("uploadFundoBlock");
                                            if (el) el.classList.toggle("hidden", v !== "personalizado");
                                        }}>
                                            {modelosOptions.map((m) => (
                                                <option key={m.value} value={m.value}>
                                                    {m.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div id="uploadFundoBlock" className="sm:col-span-2 hidden">
                                        <label className="mb-1 block text-sm">Enviar Fundo Personalizado</label>
                                        <input type="file" name="fundo_personalizado" accept="image/*" className="input" />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* AÇÕES DO WIZARD */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    disabled={isFirst}
                                    className="btn inline-flex items-center gap-2"
                                >
                                    <IconChevronLeft className="size-4" />
                                    Anterior
                                </button>

                                {!isLast && (
                                    <button type="button" onClick={handleNext} className="btn btn-primary inline-flex items-center gap-2">
                                        Próximo
                                        <IconChevronRight className="size-4" />
                                    </button>
                                )}

                                {isLast && (
                                    <button
                                        type="button"
                                        onClick={generate}
                                        className="btn btn-primary inline-flex items-center gap-2"
                                    >
                                        Gerar Obituário
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setSettingsOpen(true)}
                                className="btn inline-flex items-center gap-2"
                                title="Configurações"
                            >
                                <IconSettings className="size-4" />
                                Configurações
                            </button>
                        </div>
                    </form>
                </div>

                {/* PREVIEW CARD */}
                <div className="rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur sm:p-6">
                    <h2 className="mb-3 text-lg font-semibold">Pré-visualização do Obituário</h2>

                    {previewSrc ? (
                        <>
                            <img
                                src={previewSrc}
                                alt="Pré-visualização do obituário"
                                className="mx-auto block w-full max-w-[420px] rounded-md border object-contain"
                            />

                            <div className="mt-4 flex justify-center">
                                <button onClick={download} className="btn btn-primary inline-flex items-center gap-2">
                                    <IconDownload className="size-4" />
                                    Baixar Obituário
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Gere a arte para visualizar aqui.
                        </div>
                    )}
                </div>
            </div>

            {/* SETTINGS MODAL */}
            {settingsOpen && (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                    <div className="modal w-full max-w-md">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Configurações</h3>
                            <button className="rounded-md p-1 hover:bg-muted" onClick={() => setSettingsOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm">
                                Fonte
                                <select
                                    className="input mt-1"
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

                            <label className="block text-sm">
                                Cor da Fonte
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="inline-flex size-9 items-center justify-center rounded-md border">
                                        <IconColorSwatch className="size-5 opacity-70" />
                                    </span>
                                    <input
                                        type="color"
                                        className="h-10 w-full cursor-pointer rounded-md border bg-transparent p-1"
                                        value={fontColor}
                                        onChange={(e) => setFontColor(e.target.value)}
                                    />
                                </div>
                            </label>

                            <div className="pt-2">
                                <button onClick={applySettings} className="btn btn-primary w-full">
                                    Aplicar Configurações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ===== Helpers ===== */

function drawWrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    align: "center" | "left" | "right" = "center",
) {
    const words = text.split(" ");
    let line = "";
    ctx.textAlign = align;
    for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + " ";
        const w = ctx.measureText(test).width;
        if (w > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + " ";
            y += lineHeight;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, y);
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}
function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}
