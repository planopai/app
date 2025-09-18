// components/SignatureModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { API } from "./constants";
import { jsonWith401 } from "./helpers";

export default function SignatureModal({
    open,
    onClose,
    registro,
    tipo, // "recebimento" | "requisicao"
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro;
    tipo: "recebimento" | "requisicao";
    onSaved: (url?: string) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [drawing, setDrawing] = useState(false);
    const [paths, setPaths] = useState<Array<Array<{ x: number; y: number }>>>([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [url, setUrl] = useState("");

    // prepara o canvas transparente (sem fill branco)
    useEffect(() => {
        if (!open) return;
        const c = canvasRef.current!;
        const ctx = c.getContext("2d")!;

        const w = 960;
        const h = 240;
        const ratio = window.devicePixelRatio || 1;
        c.width = w * ratio;
        c.height = h * ratio;
        c.style.width = w + "px";
        c.style.height = h + "px";
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#000";

        setPaths([]);
        setMsg(null);
        setUrl("");
        ctx.clearRect(0, 0, w, h); // mantém fundo TRANSPARENTE
    }, [open]);

    const redraw = () => {
        const c = canvasRef.current!;
        const ctx = c.getContext("2d")!;
        const w = c.clientWidth;
        const h = c.clientHeight;
        ctx.clearRect(0, 0, w, h); // transparente
        ctx.beginPath();
        for (const path of paths) {
            path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        }
        ctx.stroke();
    };

    const getXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const { x, y } = getXY(e);
        setDrawing(true);
        setPaths((ps) => [...ps, [{ x, y }]]);
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing) return;
        const { x, y } = getXY(e);
        setPaths((ps) => {
            const last = ps[ps.length - 1];
            last.push({ x, y });
            const next = [...ps.slice(0, -1), last];
            // redesenha no próximo frame
            requestAnimationFrame(redraw);
            return next;
        });
    };

    const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setDrawing(false);
    };

    const clearAll = () => {
        setPaths([]);
        requestAnimationFrame(redraw);
    };

    const undo = () => {
        if (!paths.length) return;
        setPaths((ps) => {
            const next = ps.slice(0, -1);
            requestAnimationFrame(redraw);
            return next;
        });
    };

    const saveSignature = async () => {
        if (!registro?.id) {
            setMsg({ text: "Registro inválido.", ok: false });
            return;
        }
        if (!paths.length) {
            setMsg({ text: "Faça a assinatura antes de salvar.", ok: false });
            return;
        }
        try {
            setSaving(true);
            const dataUrl = canvasRef.current!.toDataURL("image/png"); // PNG com alpha
            const res = await jsonWith401(`${API}/api/php/assinaturas.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: String(registro.id),
                    tipo,
                    imagem_base64: dataUrl,
                }),
            });
            if (res?.sucesso) {
                setMsg({ text: "Assinatura salva!", ok: true });
                setUrl(res?.url || "");
                onSaved(res?.url);
            } else {
                setMsg({ text: res?.erro || "Falha ao salvar.", ok: false });
            }
        } catch (e: any) {
            setMsg({ text: e?.message || "Erro ao salvar.", ok: false });
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Assinatura" maxWidth={1024}>
            <h3 className="text-lg font-semibold">
                {tipo === "recebimento" ? "Assinar Termo de Recebimento" : "Assinar Termo de Requisição de Veículo"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Assine dentro do quadro abaixo.</p>

            <div className="mt-4 overflow-auto rounded-lg border bg-white">
                <canvas
                    ref={canvasRef}
                    className="touch-none"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerLeave={onUp}
                />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-md border px-3 py-2 text-sm" onClick={undo}>Desfazer</button>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={clearAll}>Limpar</button>
                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                    disabled={saving}
                    onClick={saveSignature}
                >
                    {saving ? "Salvando..." : "Salvar Assinatura"}
                </button>
                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white"
                    >
                        Baixar Assinatura (PNG)
                    </a>
                )}
                <button className="ml-auto rounded-md border px-3 py-2 text-sm" onClick={onClose}>Fechar</button>
            </div>

            {msg && (
                <div className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
                    {msg.text}
                </div>
            )}
        </Modal>
    );
}
