// components/SignatureModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { API, materiaisConfig } from "./constants";
import { jsonWith401 } from "./helpers";

type Step = 0 | 1 | 2; // 0: nome, 1: cpf, 2: assinatura

type MatItem = { rotulo: string; qtd: number };

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

    // guarda a assinatura atual (do canvas) para compor o termo local em PNG
    const [assinaturaB64, setAssinaturaB64] = useState<string>("");

    // ---- assinatura (canvas) ----
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [drawing, setDrawing] = useState(false);
    const [paths, setPaths] = useState<Array<Array<{ x: number; y: number }>>>([]);

    // reset geral ao abrir
    useEffect(() => {
        if (!open) return;
        setStep(0);
        setNome("");
        setCpf("");
        setMsg(null);
        setUrl("");
        setPaths([]);
        setAssinaturaB64("");
    }, [open]);

    // inicializa o canvas SOMENTE no passo 2 (assinatura)
    useEffect(() => {
        if (!open || step !== 2) return;
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;

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
        setPaths([]);
    }, [open, step]);

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
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
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
            const dataUrl = canvasRef.current!.toDataURL("image/png");
            setAssinaturaB64(dataUrl); // mantém para gerar o termo local

            const res = await jsonWith401(`${API}/api/php/informativo.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvar_assinatura",
                    id: String(registro.id),
                    tipo: tipo === "recebimento" ? "responsavel" : "requerente",
                    base64: dataUrl,
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

    // ----------------- Geração do TERMO em imagem (PNG/JPEG) -----------------
    const TIMBRADO_PATH = "/timbrado.png"; // opcional; se não existir, usamos fundo branco

    async function loadImg(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // quebra simples de linha
    function wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ) {
        const words = String(text || "").split(/\s+/);
        let line = "";
        let yy = y;
        for (let n = 0; n < words.length; n++) {
            const test = line ? line + " " + words[n] : words[n];
            const w = ctx.measureText(test).width;
            if (w > maxWidth && line) {
                ctx.fillText(line, x, yy);
                line = words[n];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, yy);
        return yy - y + lineHeight;
    }

    // ---- helpers: materiais, datas, formatações ----
    function soDigitos(s?: string) {
        return (s || "").replace(/\D+/g, "");
    }
    function formatCpf(s?: string) {
        const d = soDigitos(s);
        if (d.length !== 11) return s || "";
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    function formatDateISO(iso?: string) {
        const s = String(iso || "").trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return s;
    }

    function extrairMateriaisDoRegistro(r?: Registro): MatItem[] {
        if (!r) return [];
        const out: MatItem[] = [];

        // 1) Se já veio estruturado
        if (r.materiais) {
            materiaisConfig.forEach((m) => {
                const it = (r.materiais as any)[m.key];
                const qtd = Number(it?.qtd ?? 0);
                const checked = !!it?.checked;
                if (checked && qtd > 0) out.push({ rotulo: (it?.rotulo as string) || m.label, qtd });
            });
            if (out.length) return out;
        }

        // 2) JSON
        if (r.materiais_json) {
            try {
                const obj = JSON.parse(String(r.materiais_json));
                materiaisConfig.forEach((m) => {
                    const it = obj?.[m.key];
                    const qtd = Number(it?.qtd ?? 0);
                    const checked = String(it?.checked ?? "").toLowerCase();
                    const ok = qtd > 0 && ["true", "1", "sim"].includes(checked);
                    if (ok) out.push({ rotulo: (it?.rotulo as string) || m.label, qtd });
                });
            } catch {
                // segue para colunas
            }
            if (out.length) return out;
        }

        // 3) Colunas *_qtd
        materiaisConfig.forEach((m) => {
            const col = (r as any)[`materiais_${m.key}_qtd`];
            const qtd = Number(col ?? 0);
            if (qtd > 0) out.push({ rotulo: m.label, qtd });
        });

        return out;
    }

    async function baixarTermoImagem(format: "image/png" | "image/jpeg" = "image/png") {
        // requisitos: nome+cpf+assinatura
        if (!nome.trim() || cpfDigits.length !== 11 || (!assinaturaB64 && !url)) {
            setMsg({
                text: "Assine e salve primeiro para liberar o download do termo.",
                ok: false,
            });
            return;
        }

        // dados auxiliares
        const materiais = extrairMateriaisDoRegistro(registro);
        const agente = registro?.agente || "";
        const dataVelorio = formatDateISO(registro?.data_inicio_velorio);
        const dataSepultamento = formatDateISO(registro?.data_fim_velorio);
        const horaSepultamento = (registro?.hora_fim_velorio || "").toString();

        // Canvas no tamanho A4 aproximado (px) — 1240 x 1754 (≈150 DPI)
        const W = 1240;
        const H = 1754;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);

        // tenta timbrado
        try {
            const bg = await loadImg(TIMBRADO_PATH);
            ctx.drawImage(bg, 0, 0, W, H);
        } catch {
            // sem timbrado ok
        }

        // tipografia
        const center = W / 2;
        const margin = 60;
        ctx.fillStyle = "#111";
        ctx.textBaseline = "top";

        // Título
        ctx.font = "bold 36px Helvetica, Arial, sans-serif";
        const titulo =
            tipo === "recebimento"
                ? "TERMO DE RECEBIMENTO DE MATERIAL PARA ASSISTÊNCIA"
                : "REQUISIÇÃO DE VEÍCULO FUNERÁRIO PARA SEPULTAMENTO";
        const tW = ctx.measureText(titulo).width;
        ctx.fillText(titulo, center - tW / 2, 120);

        // Conteúdo
        ctx.font = "normal 22px Helvetica, Arial, sans-serif";
        const maxW = W - margin * 2;
        let y = 200;

        // helper linha
        const linha = (label: string, value: string) => {
            ctx.font = "bold 22px Helvetica, Arial, sans-serif";
            const lbl = `${label}: `;
            const lblW = ctx.measureText(lbl).width;
            ctx.fillText(lbl, margin, y);

            ctx.font = "normal 22px Helvetica, Arial, sans-serif";
            const used = wrapText(ctx, value || "________________________", margin + lblW, y, maxW - lblW, 28);
            y += used + 6;
        };

        if (tipo === "recebimento") {
            linha("Responsável", nome);
            linha("CPF", formatCpf(cpf));
            linha("Falecido(a)", registro?.falecido || "");
            if (agente) linha("Entregue por (Agente)", agente);
            y += 6;
            ctx.font = "normal 20px Helvetica, Arial, sans-serif";
            y += wrapText(
                ctx,
                "Confirmo o recebimento do material e me comprometo a zelar e devolver nas mesmas condições os seguintes itens:",
                margin,
                y,
                maxW,
                26
            );

            // itens
            ctx.font = "normal 20px Helvetica, Arial, sans-serif";
            if (!materiais.length) {
                y += 8;
                y += wrapText(ctx, "— Nenhum item selecionado —", margin, y, maxW, 26);
            } else {
                y += 10;
                for (const it of materiais.sort((a, b) => a.rotulo.localeCompare(b.rotulo))) {
                    const line = `– ${it.rotulo}: ${it.qtd}`;
                    y += wrapText(ctx, line, margin, y, maxW, 26);
                    y += 2;
                }
            }

            // data
            if (dataVelorio) {
                y += 14;
                ctx.font = "bold 20px Helvetica, Arial, sans-serif";
                ctx.fillText(`Barreiras-BA, ${dataVelorio}`, margin + 6, y);
            }
        } else {
            linha("Requerente", nome);
            linha("CPF", formatCpf(cpf));
            linha("Falecido(a)", registro?.falecido || "");
            if (dataSepultamento) linha("Data do Sepultamento", dataSepultamento);
            if (horaSepultamento) linha("Horário", horaSepultamento);

            y += 6;
            ctx.font = "normal 20px Helvetica, Arial, sans-serif";
            y += wrapText(
                ctx,
                "Solicito à empresa PAI - Plano Assistencial Integrado, veículo funerário para realização de sepultamento. Desde já, tenho conhecimento que esse pedido deve ser realizado com antecedência mínima de 05 (cinco) horas. Caso o atendimento ocorra fora desse horário, a empresa está isenta de responsabilidades por qualquer contratempo.",
                margin,
                y,
                maxW,
                26
            );
        }

        // Linha de assinatura
        const LINE_Y = H - 260;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin + 40, LINE_Y);
        ctx.lineTo(W - margin - 40, LINE_Y);
        ctx.stroke();

        // Assinatura (centralizada acima da linha)
        try {
            const signImg = await loadImg(assinaturaB64 || url);
            const SIGN_W = 420; // px
            const ratio = signImg.width ? SIGN_W / signImg.width : 1;
            const SIGN_H = signImg.height ? signImg.height * ratio : 160;
            const x = center - SIGN_W / 2;
            const yImg = LINE_Y - SIGN_H - 8;
            ctx.drawImage(signImg, x, yImg, SIGN_W, SIGN_H);
        } catch {
            // ok
        }

        // Rótulo abaixo da linha + Nome/CPF
        ctx.font = "normal 20px Helvetica, Arial, sans-serif";
        ctx.fillStyle = "#111";
        const rotulo =
            tipo === "recebimento"
                ? "Responsável pelo recebimento (assinatura)"
                : "Requerente (assinatura)";
        const rotW = ctx.measureText(rotulo).width;
        ctx.fillText(rotulo, center - rotW / 2, LINE_Y + 10);

        ctx.font = "normal 18px Helvetica, Arial, sans-serif";
        const cpfTxt = formatCpf(cpf);
        const nomeTxt = nome;
        const gapCol = 90;

        const cpfW = ctx.measureText(cpfTxt).width;
        ctx.fillText(cpfTxt, center - gapCol - cpfW, LINE_Y + 42);
        const nomeW = ctx.measureText(nomeTxt).width;
        ctx.fillText(nomeTxt, center + gapCol, LINE_Y + 42);

        // Exporta para imagem
        const dataUrl = c.toDataURL(format, format === "image/jpeg" ? 0.92 : undefined);

        // Baixar
        const a = document.createElement("a");
        const tipoNome = tipo === "recebimento" ? "termo-recebimento" : "termo-requisicao";
        const base = (registro?.falecido || "documento")
            .toString()
            .trim()
            .replace(/\s+/g, "_")
            .toLowerCase();
        a.download = `${tipoNome}-${base}.${format === "image/png" ? "png" : "jpg"}`;
        a.href = dataUrl;
        a.click();
    }

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Assinatura" maxWidth={1024}>
            <h3 className="text-lg font-semibold">
                {tipo === "recebimento"
                    ? "Assinar Termo de Recebimento"
                    : "Assinar Termo de Requisição de Veículo"}
            </h3>

            <div className="mt-2 text-xs text-muted-foreground">
                {step === 0 && "Passo 1 de 3 — Identificação: Nome"}
                {step === 1 && "Passo 2 de 3 — Identificação: CPF"}
                {step === 2 && "Passo 3 de 3 — Assinatura"}
            </div>

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

            {step === 2 && (
                <>
                    <p className="mt-3 text-sm text-muted-foreground">Assine dentro do quadro abaixo.</p>
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

                        {/* ✅ Botão verde: baixa o TERMO (imagem) já com a assinatura e dados preenchidos */}
                        <button
                            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                            title="Baixar a página do termo assinada (PNG)"
                            disabled={!(assinaturaB64 || url) || !nome.trim() || cpfDigits.length !== 11}
                            onClick={() => baixarTermoImagem("image/png")}
                        >
                            Baixar Termo (PNG)
                        </button>

                        {/* ❌ Botão/Link de 'Baixar Assinatura (PNG)' foi removido/desativado */}

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
