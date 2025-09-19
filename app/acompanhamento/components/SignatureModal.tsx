// components/SignatureModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { API } from "./constants";
import { jsonWith401 } from "./helpers";

type Step = 0 | 1 | 2; // 0: nome, 1: cpf, 2: assinatura

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
    const [step, setStep] = useState<Step>(0);
    const [nome, setNome] = useState("");
    const [cpf, setCpf] = useState("");
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [saving, setSaving] = useState(false);
    const [url, setUrl] = useState("");

    // ---- assinatura (canvas) ----
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [drawing, setDrawing] = useState(false);
    const [paths, setPaths] = useState<Array<Array<{ x: number; y: number }>>>([]);

    // abre/reset
    useEffect(() => {
        if (!open) return;
        setStep(0);
        setNome("");
        setCpf("");
        setMsg(null);
        setUrl("");
        setPaths([]);
        // prepara canvas transparente
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
        ctx.clearRect(0, 0, w, h);
    }, [open]);

    // máscara simples de CPF (###.###.###-##)
    function maskCpf(v: string) {
        const d = v.replace(/\D+/g, "").slice(0, 11);
        const p1 = d.slice(0, 3);
        const p2 = d.slice(3, 6);
        const p3 = d.slice(6, 9);
        const p4 = d.slice(9, 11);
        let out = p1;
        if (p2) out += "." + p2;
        if (p3) out += "." + p3;
        if (p4) out += "-" + p4;
        return out;
    }
    const cpfDigits = cpf.replace(/\D+/g, "");

    // desenho
    const redraw = () => {
        const c = canvasRef.current!;
        const ctx = c.getContext("2d")!;
        const w = c.clientWidth;
        const h = c.clientHeight;
        ctx.clearRect(0, 0, w, h);
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

    // salvar
    const saveSignature = async () => {
        if (!registro?.id) {
            setMsg({ text: "Registro inválido.", ok: false });
            return;
        }
        if (!nome.trim()) {
            setMsg({ text: "Informe o nome.", ok: false });
            setStep(0);
            return;
        }
        if (cpfDigits.length !== 11) {
            setMsg({ text: "Informe um CPF com 11 dígitos.", ok: false });
            setStep(1);
            return;
        }
        if (!paths.length) {
            setMsg({ text: "Faça a assinatura antes de salvar.", ok: false });
            setStep(2);
            return;
        }

        try {
            setSaving(true);
            const dataUrl = canvasRef.current!.toDataURL("image/png"); // PNG com alpha

            const res = await jsonWith401(`${API}/api/php/informativo.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvar_assinatura",
                    id: String(registro.id),
                    tipo: tipo === "recebimento" ? "responsavel" : "requerente",
                    base64: dataUrl,
                    // novos campos (o PHP atual pode ignorar; se quiser persistir, tratar lá)
                    nome_assinatura: nome.trim(),
                    cpf_assinatura: cpfDigits,
                }),
            });

            if (res?.sucesso) {
                setMsg({ text: "Assinatura salva!", ok: true });
                setUrl(res?.url || "");
                onSaved(res?.url);
            } else {
                setMsg({ text: res?.msg || "Falha ao salvar.", ok: false });
            }
        } catch (e: any) {
            setMsg({ text: e?.message || "Erro ao salvar.", ok: false });
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Assinatura" maxWidth={560}>
            <h3 className="text-lg font-semibold">
                {tipo === "recebimento"
                    ? "Assinar Termo de Recebimento"
                    : "Assinar Termo de Requisição de Veículo"}
            </h3>

            {/* Steps indicator simples */}
            <div className="mt-2 text-xs text-muted-foreground">
                {step === 0 && "Passo 1 de 3 — Identificação: Nome"}
                {step === 1 && "Passo 2 de 3 — Identificação: CPF"}
                {step === 2 && "Passo 3 de 3 — Assinatura"}
            </div>

            {/* STEP 0: NOME */}
            {step === 0 && (
                <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium">Nome completo</label>
                    <input
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Digite o nome do responsável/requerente"
                    />
                    <div className="mt-4 flex justify-end gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={onClose}>
                            Cancelar
                        </button>
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                            disabled={nome.trim().length < 3}
                            onClick={() => setStep(1)}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 1: CPF */}
            {step === 1 && (
                <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium">CPF</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={cpf}
                        onChange={(e) => setCpf(maskCpf(e.target.value))}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="000.000.000-00"
                        maxLength={14}
                    />
                    <div className="mt-4 flex justify-between gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setStep(0)}>
                            Voltar
                        </button>
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                            disabled={cpfDigits.length !== 11}
                            onClick={() => setStep(2)}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: ASSINATURA */}
            {step === 2 && (
                <>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Assine dentro do quadro abaixo.
                    </p>
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
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setStep(1)}>
                            Voltar
                        </button>
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={undo}>
                            Desfazer
                        </button>
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={clearAll}>
                            Limpar
                        </button>
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
                        <button className="ml-auto rounded-md border px-3 py-2 text-sm" onClick={onClose}>
                            Fechar
                        </button>
                    </div>
                </>
            )}

            {msg && (
                <div className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
                    {msg.text}
                </div>
            )}
        </Modal>
    );
}
