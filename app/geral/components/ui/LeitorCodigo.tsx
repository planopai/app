"use client";

import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { clampInt } from "../formato";
import type { Produto } from "../tipos";
import { Button, Field, TextInput } from "./Basicos";
import { Modal } from "./Modal";

// Leitor de código de barras e quantidade do item lido.

/* =========================
   MODAL (POPUP) PARA QUANTIDADE APÓS SCAN (Saída / Transferência)
========================= */

export function ScanQtyModal({
    open,
    title,
    subtitle,
    produto,
    depositoNome,
    disponivel,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    produto: Produto | null;
    depositoNome?: string;
    disponivel: number;
    onClose: () => void;
    onConfirm: (quantidade: number) => void;
}) {
    const [qtd, setQtd] = useState<number>(1);

    useEffect(() => {
        if (!open) return;
        setQtd(1);
    }, [open, produto?.id]);

    const max = Math.max(0, clampInt(disponivel));
    const safeQtd = clampInt(qtd) || 1;
    const invalid = !produto || safeQtd <= 0 || safeQtd > max || max <= 0;

    return (
        <Modal open={open} title={title} subtitle={subtitle} onClose={onClose}>
            {!produto ? (
                <div className="rounded-xl border border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] p-3 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Produto não encontrado.</div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] p-3">
                        <p className="text-sm font-semibold text-[#313C55] dark:text-white">{produto.nome}</p>
                        <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                            CB: <b>{produto.codigo_barras}</b>
                            {depositoNome ? (
                                <>
                                    {" "}
                                    • Depósito: <b>{depositoNome}</b>
                                </>
                            ) : null}
                        </p>
                        <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                            Disponível em estoque: <b>{max}</b>
                        </p>
                    </div>

                    {max <= 0 ? (
                        <div className="rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">
                            Este produto está <b>sem saldo</b> no depósito selecionado.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Quantidade" hint={`Máximo permitido: ${max}`}>
                                <TextInput
                                    type="number"
                                    min={1}
                                    max={max}
                                    value={safeQtd}
                                    onChange={(e) => setQtd(clampInt(e.target.value) || 1)}
                                />
                            </Field>

                            <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] p-3 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                Ao clicar em <b>OK</b>, o item já entra na lista.
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            onClick={() => onConfirm(Math.min(max, Math.max(1, safeQtd)))}
                            disabled={invalid}
                        >
                            OK / Adicionar
                        </Button>
                        <Button variant="ghost" type="button" onClick={onClose}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   SCANNER
========================= */

export function BarcodeScannerModal({
    open,
    title,
    onClose,
    onDetected,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    onDetected: (code: string) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setErr("");

        const start = async () => {
            try {
                const codeReader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (!devices?.length) throw new Error("Nenhuma câmera encontrada.");

                const backCam =
                    devices.find((d) => /back|traseira|environment/i.test(d.label))?.deviceId || devices[0]?.deviceId;
                if (!videoRef.current) throw new Error("Vídeo não disponível.");

                const controls = await codeReader.decodeFromVideoDevice(backCam ?? undefined, videoRef.current, (result) => {
                    if (cancelled) return;
                    if (result) {
                        const text = result.getText().trim();
                        if (text) {
                            onDetected(text);
                            onClose();
                        }
                    }
                });

                controlsRef.current = { stop: () => controls.stop() };
            } catch (e: any) {
                setErr(e?.message || "Não foi possível abrir a câmera.");
            }
        };

        start();

        return () => {
            cancelled = true;

            try {
                controlsRef.current?.stop();
            } catch {
                // ignore
            }
            controlsRef.current = null;

            const el = videoRef.current;
            if (el?.srcObject) {
                const tracks = (el.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
                (el.srcObject as any) = null;
            }
        };
    }, [open, onClose, onDetected]);

    return (
        <Modal open={open} title={title} subtitle="Aponte para o código. Ao detectar, preenche automaticamente." onClose={onClose}>
            {err ? (
                <div className="rounded-xl border border-[#B42318] dark:border-[#FF9C92] bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">{err}</div>
            ) : (
                <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-black">
                        <video ref={videoRef} className="h-[320px] w-full object-cover sm:h-[420px]" playsInline muted />

                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute inset-0 bg-black/25" />

                            <div className="absolute left-1/2 top-1/2 w-[92%] max-w-[560px] -translate-x-1/2 -translate-y-1/2">
                                <div className="relative mx-auto h-[110px] w-full rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                <p className="mt-2 text-center text-xs text-white/90">Centralize o código dentro do retângulo</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
