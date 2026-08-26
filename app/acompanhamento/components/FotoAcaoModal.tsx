"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import type { Registro } from "./types";
import { browserSaysOnline, getCurrentOfflineSession } from "@/lib/offline/session";
import { getOperationalTimestamp } from "@/lib/offline/clock";
import { getOfflineDeviceId } from "@/lib/offline/device";
import { newOfflineId } from "@/lib/offline/db";
import { saveOfflinePhoto } from "@/lib/offline/photos";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

export type FotoAcaoTipo = "fim_ornamentacao" | "entrega_corpo";
type FotoAcaoFase = "fase06" | "fase08";

/* =========================================================
   FOTO LEVE / ANDROID
   =========================================================
   Objetivos:
   - NÃO usar FileReader / Base64.
   - Capturar em resolução controlada.
   - JPEG leve (meta <= ~260 KB).
   - Enviar via multipart/form-data.
   - Manter em memória somente Blob comprimido + miniatura.
   ========================================================= */

const CAMERA_MAX_WIDTH = 960;
const CAMERA_MAX_HEIGHT = 720;
const THUMB_MAX_WIDTH = 320;
const THUMB_MAX_HEIGHT = 240;
const TARGET_PHOTO_BYTES = 260 * 1024;
const HARD_PHOTO_BYTES = 420 * 1024;
const UPLOAD_TIMEOUT_MS = 30_000;

const JPEG_QUALITIES = [0.62, 0.56, 0.50, 0.44, 0.38, 0.32] as const;

function getTitulo(tipo?: FotoAcaoTipo | null) {
    if (tipo === "fim_ornamentacao") return "ANEXE A FOTO";
    if (tipo === "entrega_corpo") return "ANEXE A FOTO";
    return "ANEXE A FOTO";
}

function SubtituloFoto({ tipo }: { tipo?: FotoAcaoTipo | null }) {
    if (tipo === "fim_ornamentacao") {
        return (
            <div className="mt-1 text-sm text-muted-foreground">
                <div>ANEXE A FOTO DA ORNAMENTAÇÃO</div>
                <div className="mt-1 font-bold uppercase text-red-600">
                    SEM MOSTRAR O ROSTO DO FALECIDO
                </div>
            </div>
        );
    }

    if (tipo === "entrega_corpo") {
        return (
            <div className="mt-1 text-sm text-muted-foreground">
                ANEXE UMA FOTO DA PARAMENTAÇÃO
            </div>
        );
    }

    return (
        <div className="mt-1 text-sm text-muted-foreground">
            Foto obrigatória para confirmar esta ação.
        </div>
    );
}

function fitInside(
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number,
    maxHeight: number,
) {
    const safeW = Math.max(1, Math.floor(sourceWidth || 1));
    const safeH = Math.max(1, Math.floor(sourceHeight || 1));
    const scale = Math.min(maxWidth / safeW, maxHeight / safeH, 1);

    return {
        width: Math.max(1, Math.round(safeW * scale)),
        height: Math.max(1, Math.round(safeH * scale)),
    };
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality?: number,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Não foi possível compactar a foto."));
                    return;
                }
                resolve(blob);
            },
            type,
            quality,
        );
    });
}

async function encodeJpegLeve(canvas: HTMLCanvasElement): Promise<Blob> {
    let best: Blob | null = null;

    for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        best = blob;

        if (blob.size <= TARGET_PHOTO_BYTES) {
            return blob;
        }
    }

    if (!best) {
        throw new Error("Não foi possível compactar a foto.");
    }

    // 960x720 em qualidade baixa normalmente já fica abaixo do limite.
    // Se ainda assim a cena gerar um JPEG grande, reduz um pouco a resolução
    // sem nunca voltar para Base64.
    if (best.size > HARD_PHOTO_BYTES) {
        const reduced = document.createElement("canvas");
        const reducedSize = fitInside(canvas.width, canvas.height, 760, 570);
        reduced.width = reducedSize.width;
        reduced.height = reducedSize.height;

        const ctx = reduced.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Não foi possível preparar a foto.");

        ctx.drawImage(canvas, 0, 0, reduced.width, reduced.height);

        try {
            for (const quality of JPEG_QUALITIES) {
                const blob = await canvasToBlob(reduced, "image/jpeg", quality);
                best = blob;
                if (blob.size <= TARGET_PHOTO_BYTES) return blob;
            }
        } finally {
            reduced.width = 1;
            reduced.height = 1;
        }
    }

    if (best.size > HARD_PHOTO_BYTES) {
        throw new Error(
            "A foto ainda ficou muito grande após a otimização. Tire novamente com boa iluminação.",
        );
    }

    return best;
}

async function criarMiniaturaDoCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
    const thumbSize = fitInside(
        canvas.width,
        canvas.height,
        THUMB_MAX_WIDTH,
        THUMB_MAX_HEIGHT,
    );

    const thumb = document.createElement("canvas");
    thumb.width = thumbSize.width;
    thumb.height = thumbSize.height;

    const ctx = thumb.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Não foi possível gerar a miniatura.");

    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);

    try {
        return await canvasToBlob(thumb, "image/jpeg", 0.48);
    } finally {
        thumb.width = 1;
        thumb.height = 1;
    }
}

async function comprimirArquivoSelecionado(file: File): Promise<{
    foto: Blob;
    miniatura: Blob;
}> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Selecione uma imagem válida.");
    }

    if (typeof createImageBitmap !== "function") {
        throw new Error(
            "Este navegador não consegue reduzir a foto com segurança. Use a câmera integrada do sistema.",
        );
    }

    let bitmap: ImageBitmap | null = null;

    try {
        // resizeWidth faz a redução já durante a criação do bitmap em navegadores
        // modernos, evitando manter a foto de dezenas de megapixels no DOM/React.
        bitmap = await createImageBitmap(file, {
            resizeWidth: CAMERA_MAX_WIDTH,
            resizeQuality: "medium",
            imageOrientation: "from-image",
        });

        const size = fitInside(
            bitmap.width,
            bitmap.height,
            CAMERA_MAX_WIDTH,
            CAMERA_MAX_HEIGHT,
        );

        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Não foi possível preparar a foto.");

        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        try {
            const foto = await encodeJpegLeve(canvas);
            const miniatura = await criarMiniaturaDoCanvas(canvas);
            return { foto, miniatura };
        } finally {
            canvas.width = 1;
            canvas.height = 1;
        }
    } finally {
        bitmap?.close();
    }
}

async function salvarFotoAcao({
    id,
    tipo,
    foto,
    signal,
    operationId,
    ocorreuEm,
    deviceId,
    userId,
}: {
    id: string | number;
    tipo: FotoAcaoTipo;
    foto: Blob;
    signal: AbortSignal;
    operationId: string;
    ocorreuEm: string;
    deviceId: string;
    userId: string;
}) {
    const form = new FormData();
    form.append("acao", "salvar_foto_acao");
    form.append("id", String(id));
    form.append("tipo", tipo);
    form.append("foto", foto, `${tipo}.jpg`);
    form.append("operation_id", operationId);
    form.append("ocorreu_em", ocorreuEm);
    form.append("device_id", deviceId);
    form.append("usuario_id", userId);
    form.append("origem", "online");

    const res = await fetch(`${ENDPOINT}/informativo.php`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        body: form,
        signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.sucesso) {
        const err: any = new Error(data?.msg || `Erro HTTP ${res.status} ao salvar a foto.`);
        err.status = res.status;
        throw err;
    }

    return data as {
        sucesso: true;
        url?: string;
        path?: string;
        bytes?: number;
        width?: number;
        height?: number;
    };
}

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    return `${Math.round(bytes / 1024)} KB`;
}

export default function FotoAcaoModal({
    open,
    onClose,
    registro,
    registroId,
    fase,
    tipo,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
    registroId?: string | number | null;
    fase?: FotoAcaoFase | string | null;
    tipo?: FotoAcaoTipo | null;
    onSaved: (payload: {
        id: string | number;
        fase: FotoAcaoFase | string;
        tipo: FotoAcaoTipo;
        url?: string;
        path?: string;
        offline?: boolean;
        photoId?: string;
        photoOperationId?: string;
        occurredAt?: string;
    }) => void | Promise<void>;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const previewUrlRef = useRef<string>("");
    const uploadAbortRef = useRef<AbortController | null>(null);

    const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraStarting, setCameraStarting] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const resolvedId = registroId ?? registro?.id ?? null;

    function revogarPreview() {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = "";
        }
        setPreviewUrl("");
    }

    function limparFoto() {
        revogarPreview();
        setFotoBlob(null);
    }

    function pararCamera() {
        const stream = streamRef.current;
        streamRef.current = null;

        if (stream) {
            for (const track of stream.getTracks()) {
                try {
                    track.stop();
                } catch {
                    // noop
                }
            }
        }

        if (videoRef.current) {
            try {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
            } catch {
                // noop
            }
        }

        setCameraOpen(false);
    }

    function definirFoto(foto: Blob, miniatura: Blob) {
        revogarPreview();

        const url = URL.createObjectURL(miniatura);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setFotoBlob(foto);
    }

    useEffect(() => {
        if (!open) return;

        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        pararCamera();
        limparFoto();
        setCameraStarting(false);
        setProcessing(false);
        setSaving(false);
        setMsg(null);

        if (inputRef.current) inputRef.current.value = "";
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, registroId, registro?.id, fase, tipo]);

    useEffect(() => {
        return () => {
            uploadAbortRef.current?.abort();
            uploadAbortRef.current = null;
            pararCamera();
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = "";
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function abrirCamera() {
        if (saving || processing || cameraStarting) return;

        setMsg(null);
        limparFoto();
        pararCamera();
        setCameraStarting(true);

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                inputRef.current?.click();
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: CAMERA_MAX_WIDTH, max: 1280 },
                    height: { ideal: CAMERA_MAX_HEIGHT, max: 960 },
                    frameRate: { ideal: 15, max: 20 },
                },
            });

            streamRef.current = stream;
            setCameraOpen(true);

            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            });

            const video = videoRef.current;
            if (!video) throw new Error("Câmera não disponível.");

            video.srcObject = stream;
            await video.play();
        } catch (e: any) {
            pararCamera();

            // Fallback: abre a câmera nativa via input. Ainda assim a foto será
            // reduzida sem FileReader/Base64 antes do envio.
            setMsg({
                ok: false,
                text:
                    e?.name === "NotAllowedError"
                        ? "Permissão da câmera não concedida. Abrindo a câmera do celular..."
                        : "Não foi possível abrir a câmera integrada. Abrindo a câmera do celular...",
            });

            setTimeout(() => inputRef.current?.click(), 80);
        } finally {
            setCameraStarting(false);
        }
    }

    async function tirarFoto() {
        if (processing || saving) return;

        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
            setMsg({ ok: false, text: "A câmera ainda não está pronta. Aguarde um instante." });
            return;
        }

        setMsg(null);
        setProcessing(true);

        const size = fitInside(
            video.videoWidth,
            video.videoHeight,
            CAMERA_MAX_WIDTH,
            CAMERA_MAX_HEIGHT,
        );

        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;

        try {
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) throw new Error("Não foi possível capturar a foto.");

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const foto = await encodeJpegLeve(canvas);
            const miniatura = await criarMiniaturaDoCanvas(canvas);

            definirFoto(foto, miniatura);
            pararCamera();

            setMsg({
                ok: true,
                text: `Foto pronta para envio (${formatBytes(foto.size)}).`,
            });
        } catch (e: any) {
            setMsg({
                ok: false,
                text: e?.message || "Não foi possível preparar a foto.",
            });
        } finally {
            canvas.width = 1;
            canvas.height = 1;
            setProcessing(false);
        }
    }

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        setMsg(null);

        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file) return;

        pararCamera();
        limparFoto();
        setProcessing(true);

        try {
            const { foto, miniatura } = await comprimirArquivoSelecionado(file);
            definirFoto(foto, miniatura);
            setMsg({
                ok: true,
                text: `Foto pronta para envio (${formatBytes(foto.size)}).`,
            });
        } catch (e: any) {
            limparFoto();
            setMsg({
                ok: false,
                text:
                    e?.message ||
                    "Não foi possível reduzir a foto com segurança. Tente novamente pela câmera.",
            });
        } finally {
            setProcessing(false);
        }
    }

    async function handleSalvar() {
        if (saving || processing) return;

        setMsg(null);

        if (!resolvedId) {
            setMsg({ ok: false, text: "Registro inválido. Feche e tente novamente." });
            return;
        }

        if (!tipo) {
            setMsg({ ok: false, text: "Tipo da foto não informado." });
            return;
        }

        if (!fase) {
            setMsg({ ok: false, text: "Fase da ação não informada." });
            return;
        }

        if (!fotoBlob) {
            setMsg({ ok: false, text: "A foto é obrigatória. Abra a câmera e tire a foto." });
            return;
        }

        if (fotoBlob.size > HARD_PHOTO_BYTES) {
            setMsg({ ok: false, text: "A foto ficou acima do limite seguro. Tire novamente." });
            return;
        }

        // Somente Entrega de Corpo (fase08) é autorizada offline nesta versão.
        if (!browserSaysOnline() && String(fase) !== "fase08") {
            setMsg({ ok: false, text: "Esta etapa exige conexão com a internet." });
            return;
        }

        const session = await getCurrentOfflineSession({
            refreshIfOnline: browserSaysOnline(),
            allowCachedOnNetworkFailure: true,
        });
        if (!session) {
            setMsg({ ok: false, text: "Usuário não identificado para registrar a foto." });
            return;
        }

        const timestamp = await getOperationalTimestamp();
        const deviceId = await getOfflineDeviceId();
        const photoOperationId = newOfflineId("photo-op");

        const saveLocally = async () => {
            if (String(fase) !== "fase08" || tipo !== "entrega_corpo") {
                throw new Error("Somente a foto da Entrega de Corpo pode ser guardada offline nesta versão.");
            }

            const local = await saveOfflinePhoto({
                recordId: resolvedId,
                kind: tipo,
                blob: fotoBlob,
                operationId: photoOperationId,
                capturedAt: timestamp.occurredAt,
            });

            setMsg({ ok: true, text: "Foto guardada no aparelho. A ação será sincronizada quando a internet voltar." });
            await onSaved({
                id: resolvedId,
                fase,
                tipo,
                offline: true,
                photoId: local.photoId,
                photoOperationId: local.operationId,
                occurredAt: local.capturedAt,
            });
            limparFoto();
            onClose();
        };

        if (!browserSaysOnline()) {
            try {
                setSaving(true);
                await saveLocally();
            } catch (e: any) {
                setMsg({ ok: false, text: e?.message || "Falha ao guardar a foto offline." });
            } finally {
                setSaving(false);
            }
            return;
        }

        const controller = new AbortController();
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = controller;
        const timer = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

        try {
            setSaving(true);

            const saved = await salvarFotoAcao({
                id: resolvedId,
                tipo,
                foto: fotoBlob,
                signal: controller.signal,
                operationId: photoOperationId,
                ocorreuEm: timestamp.occurredAt,
                deviceId,
                userId: session.userId,
            });

            setMsg({ ok: true, text: "Foto salva com sucesso. Confirmando ação..." });
            await onSaved({
                id: resolvedId,
                fase,
                tipo,
                url: saved.url,
                path: saved.path,
                offline: false,
                photoOperationId,
                occurredAt: timestamp.occurredAt,
            });

            limparFoto();
            onClose();
        } catch (e: any) {
            const networkFailure =
                e?.name === "AbortError" ||
                e?.name === "TypeError" ||
                String(e?.message || "").toLowerCase().includes("failed to fetch") ||
                String(e?.message || "").toLowerCase().includes("network") ||
                String(e?.message || "").toLowerCase().includes("load failed");

            if (networkFailure && String(fase) === "fase08" && tipo === "entrega_corpo") {
                try {
                    await saveLocally();
                } catch (fallbackError: any) {
                    setMsg({ ok: false, text: fallbackError?.message || "Falha ao guardar a foto offline." });
                }
            } else {
                setMsg({ ok: false, text: e?.message || "Falha ao salvar a foto." });
            }
        } finally {
            window.clearTimeout(timer);
            if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
            setSaving(false);
        }
    }

    const busy = saving || processing || cameraStarting;

    return (
        <Modal
            open={open}
            onClose={busy ? () => { } : onClose}
            ariaLabel="Anexar foto da ação"
            maxWidth={520}
        >
            <div>
                <h2 className="text-xl font-semibold">{getTitulo(tipo)}</h2>
                <SubtituloFoto tipo={tipo} />

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                />

                <div className="mt-4">
                    <div className={cameraOpen ? "overflow-hidden rounded-xl border bg-black" : "hidden"}>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="max-h-[360px] w-full object-contain"
                        />
                    </div>

                    {!cameraOpen && (previewUrl ? (
                        <div className="overflow-hidden rounded-xl border bg-muted/30">
                            <img
                                src={previewUrl}
                                alt="Miniatura da foto anexada"
                                className="max-h-[240px] w-full object-contain"
                            />
                            <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                                Foto otimizada: {formatBytes(fotoBlob?.size ?? 0)}
                            </div>
                        </div>
                    ) : (
                        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                            {cameraStarting || processing ? (
                                <span>Preparando foto...</span>
                            ) : (
                                <span>
                                    Nenhuma foto anexada ainda.
                                    <br />
                                    Toque em “Abrir câmera”.
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {cameraOpen ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                            disabled={busy}
                            onClick={tirarFoto}
                        >
                            {processing ? "Otimizando..." : "Tirar foto"}
                        </button>

                        <button
                            type="button"
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                            disabled={busy}
                            onClick={pararCamera}
                        >
                            Fechar câmera
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <button
                            type="button"
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                            disabled={busy}
                            onClick={abrirCamera}
                        >
                            {cameraStarting ? "Abrindo..." : fotoBlob ? "Tirar outra" : "Abrir câmera"}
                        </button>

                        <button
                            type="button"
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                            disabled={busy}
                            onClick={onClose}
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                            disabled={busy || !fotoBlob}
                            onClick={handleSalvar}
                        >
                            {saving ? "Enviando..." : "Salvar"}
                        </button>
                    </div>
                )}

                {msg && (
                    <TextFeedback kind={msg.ok ? "success" : "error"}>
                        {msg.text}
                    </TextFeedback>
                )}
            </div>
        </Modal>
    );
}
