"use client";

import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "./TiposHistorico";
import { desenharRelatorio, montarDadosRelatorio } from "./PdfRelatorio";

/* ==== helpers de API para pegar assinaturas e normalizar URL ==== */
import {
    pegarAssinaturasInfoPorId,
    normalizarUrlAssinatura as normAssUrl,
    type MateriaisMap,
} from "./Api";

/*
 * 26/10/2026: o PDF passou a ser desenhado pelo PdfRelatorio.ts (layout novo: resumo em blocos,
 * tabela de itens usados, tempo por etapa, linha do tempo em tabela e termos). Este arquivo
 * continua cuidando do botão, do jsPDF, das assinaturas e do logo.
 */

/* =============== Props =============== */
interface Props {
    desabilitado: boolean;
    selecionadoNome: string;
    selecionadoAssinatura?: string;
    criacaoSelecionado?: string;
    logVisiveis: LogItem[];
    resumoFinal?: Record<string, any>;
    assinaturaResponsavelUrl?: string;
    assinaturaRequerenteUrl?: string;
    sepultamentoId?: string | number;
    materiaisMap?: MateriaisMap;
}

/* =============== jsPDF via CDN =============== */
function useJsPdfCdn() {
    const [ready, setReady] = useState(false);
    const once = useRef(false);

    useEffect(() => {
        if (once.current) return;
        once.current = true;

        if ((window as any).jspdf?.jsPDF) {
            setReady(true);
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => setReady(Boolean((window as any).jspdf?.jsPDF));
        script.onerror = () => setReady(false);
        document.body.appendChild(script);
    }, []);

    return ready;
}

/* =============== Helpers de imagem =============== */
function isLikelyUrl(s?: string | null) {
    if (!s) return false;
    const v = String(s).trim();
    return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/uploads/");
}

/** Carrega imagem em <img>. */
function loadImgFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };

        img.src = url;
    });
}

/**
 * Carrega assinatura (PNG) e exporta PNG com fundo branco
 */
async function loadSignatureImage(url: string, maxWidth = 800): Promise<string> {
    const res = await fetch(url, { cache: "no-store", credentials: "include" });

    if (!res.ok) {
        throw new Error("Falha ao carregar assinatura");
    }

    const blob = await res.blob();
    const img = await loadImgFromBlob(blob);

    const scale = Math.min(1, maxWidth / (img.naturalWidth || img.width || maxWidth));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL("image/png");
}

/** Logo do cabeçalho: o SVG do /public vira PNG (o jsPDF não desenha SVG). */
async function carregarLogoPng(caminho = "/logo-pai-horizontal.svg"): Promise<string | undefined> {
    try {
        const res = await fetch(caminho, { cache: "force-cache" });
        if (!res.ok) return undefined;
        let svg = await res.text();
        // SVG só com viewBox não tem tamanho próprio em alguns navegadores: põe largura e altura.
        const vb = svg.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
        const vbW = vb ? Number(vb[1]) : 796;
        const vbH = vb ? Number(vb[2]) : 214;
        if (!/<svg[^>]*\swidth=/.test(svg)) {
            svg = svg.replace("<svg", `<svg width="${vbW}" height="${vbH}"`);
        }
        const img = await loadImgFromBlob(new Blob([svg], { type: "image/svg+xml" }));
        const w = 1072;
        const h = Math.round((w * vbH) / vbW);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL("image/png");
    } catch {
        return undefined;
    }
}

/* =============== Buscas de assinatura (URLs) =============== */
function assinaturaFromResumo(resumo?: Record<string, string>, key?: "responsavel" | "requerente") {
    if (!resumo) return undefined;

    const k = key === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";

    const v =
        resumo[k] ||
        resumo[k.toUpperCase()] ||
        resumo[k.replace(/_/g, " ")] ||
        resumo[k.replace(/_/g, "-")];

    return isLikelyUrl(v) ? String(v) : undefined;
}

function assinaturaFromLogs(logs: LogItem[], tipo: "responsavel" | "requerente") {
    const alvoCampo = tipo === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";
    const ordered = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));

    for (let i = ordered.length - 1; i >= 0; i--) {
        const l = ordered[i];
        const acao = (l.acao || "").toLowerCase();
        const det = l.detalhes;

        if (acao.includes("assinou") && acao.includes(alvoCampo)) {
            if (typeof det === "string" && isLikelyUrl(det)) return det;

            try {
                const d = typeof det === "string" ? JSON.parse(det) : det;

                if (typeof d === "string" && isLikelyUrl(d)) return d;
                if ((d as any)?.url && isLikelyUrl((d as any).url)) return (d as any).url;
            } catch { }
        }

        if (typeof det === "string" && det.includes("/uploads/assinaturas/")) {
            const m = det.match(/\/uploads\/assinaturas\/[A-Za-z0-9._-]+/);
            if (m?.[0]) return m[0];
        }
    }

    return undefined;
}

/* ===== Helpers Nome/CPF ===== */
function soDigitos(s?: string) {
    return (s || "").replace(/\D+/g, "");
}

function formatCpf(s?: string) {
    const d = soDigitos(s);

    if (d.length !== 11) return s || "";

    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function getNomeCpfAssinatura(
    resumo: Record<string, string> | undefined,
    tipo: "responsavel" | "requerente",
    fallbackNome?: string
) {
    const out = { nome: "", cpf: "" };

    if (!resumo) {
        out.nome = fallbackNome || "";
        return out;
    }

    const nomesPossiveis =
        tipo === "responsavel"
            ? [
                "nome_responsavel",
                "nome_assinatura_responsavel",
                "nome_responsavel_assinatura",
                "nome_responsável",
                "nome_assinatura_responsável",
                "responsavel",
                "responsável",
                "nome_responsavel_termo",
                "assinatura_responsavel_nome",
                "nome assinatura responsavel",
            ]
            : [
                "nome_assinatura_requerente",
                "nome_requerente",
                "assinatura_requerente_nome",
                "nome assinatura requerente",
            ];

    const cpfsPossiveis =
        tipo === "responsavel"
            ? [
                "cpf_responsavel",
                "cpf_assinatura_responsavel",
                "cpf_responsável",
                "cpf_responsavel_assinatura",
                "cpf_responsavel_termo",
                "assinatura_responsavel_cpf",
                "cpf assinatura responsavel",
            ]
            : [
                "cpf_assinatura_requerente",
                "cpf_requerente",
                "assinatura_requerente_cpf",
                "cpf assinatura requerente",
            ];

    for (const k of nomesPossiveis) {
        const v =
            resumo[k] ||
            resumo[k.toUpperCase()] ||
            resumo[k.replace(/_/g, " ")] ||
            resumo[k.replace(/_/g, "-")];

        if (v) {
            out.nome = String(v);
            break;
        }
    }

    for (const k of cpfsPossiveis) {
        const v =
            resumo[k] ||
            resumo[k.toUpperCase()] ||
            resumo[k.replace(/_/g, " ")] ||
            resumo[k.replace(/_/g, "-")];

        if (v) {
            out.cpf = formatCpf(String(v));
            break;
        }
    }

    if (!out.nome) {
        out.nome = fallbackNome || "";
    }

    return out;
}

/* ===== Tentar descobrir o ID do sepultamento ===== */
function inferirSepultamentoId(
    sepultamentoId?: string | number,
    resumoFinal?: Record<string, string>,
    logs?: LogItem[]
): string | undefined {
    if (sepultamentoId != null && sepultamentoId !== "") {
        return String(sepultamentoId);
    }

    const keys = ["id", "sepultamento_id", "atendimento_id"];

    for (const k of keys) {
        const v =
            resumoFinal?.[k] ||
            resumoFinal?.[k.toUpperCase()] ||
            resumoFinal?.[k.replace(/_/g, " ")];

        if (v) return String(v);
    }

    if (logs && logs.length) {
        for (const l of logs) {
            if ((l as any).sepultamento_id) {
                return String((l as any).sepultamento_id);
            }

            const det = l.detalhes;

            try {
                const obj = typeof det === "string" ? JSON.parse(det) : det;
                const cand = obj?.id || obj?.sepultamento_id || obj?.atendimento_id;

                if (cand) return String(cand);
            } catch { }
        }
    }

    return undefined;
}

/* =============== Componente principal =============== */
export default function BotaoExportarPdf({
    desabilitado,
    selecionadoNome,
    selecionadoAssinatura,
    logVisiveis,
    resumoFinal,
    assinaturaResponsavelUrl,
    assinaturaRequerenteUrl,
    sepultamentoId,
    materiaisMap,
}: Props) {
    const [gerando, setGerando] = useState(false);
    const jsPdfOk = useJsPdfCdn();

    async function gerarPdf() {
        if (!jsPdfOk || logVisiveis.length === 0) return;

        setGerando(true);

        try {
            const { jsPDF } = (window as any).jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

            // Assinaturas
            const idInferido = inferirSepultamentoId(sepultamentoId, resumoFinal, logVisiveis);
            const assinDb = idInferido ? await pegarAssinaturasInfoPorId(idInferido) : {};

            const urlResp = normAssUrl(
                assinaturaResponsavelUrl ||
                (assinDb as any).responsavel?.url ||
                assinaturaFromResumo(resumoFinal, "responsavel") ||
                assinaturaFromLogs(logVisiveis, "responsavel")
            );

            const urlReq = normAssUrl(
                assinaturaRequerenteUrl ||
                (assinDb as any).requerente?.url ||
                assinaturaFromResumo(resumoFinal, "requerente") ||
                assinaturaFromLogs(logVisiveis, "requerente")
            );

            let assinaturaRespB64: string | undefined;
            let assinaturaReqB64: string | undefined;

            try {
                if (urlResp) assinaturaRespB64 = await loadSignatureImage(urlResp, 800);
            } catch { }

            try {
                if (urlReq) assinaturaReqB64 = await loadSignatureImage(urlReq, 800);
            } catch { }

            const respFromResumo = getNomeCpfAssinatura(resumoFinal, "responsavel", selecionadoAssinatura);
            const reqFromResumo = getNomeCpfAssinatura(resumoFinal, "requerente", selecionadoAssinatura);

            const respInfo = {
                nome: (assinDb as any).responsavel?.nome || respFromResumo.nome || "",
                cpf: formatCpf((assinDb as any).responsavel?.cpf) || respFromResumo.cpf || "",
            };

            const reqInfo = {
                nome: (assinDb as any).requerente?.nome || reqFromResumo.nome || "",
                cpf: formatCpf((assinDb as any).requerente?.cpf) || reqFromResumo.cpf || "",
            };

            const dados = montarDadosRelatorio({
                resumo: resumoFinal || {},
                logs: logVisiveis,
                materiaisMap,
                nome: selecionadoNome,
                id: idInferido,
            });

            const logoPng = await carregarLogoPng();

            desenharRelatorio(
                doc,
                dados,
                {
                    responsavel: respInfo.nome || dados.responsavelNome,
                    cpfResponsavel: respInfo.cpf || dados.responsavelCpf,
                    requerente: reqInfo.nome,
                    cpfRequerente: reqInfo.cpf,
                    assinaturaResponsavelB64: assinaturaRespB64,
                    assinaturaRequerenteB64: assinaturaReqB64,
                },
                logoPng,
            );

            const filename = `${String(selecionadoNome || "relatorio").toUpperCase()}.pdf`;
            doc.save(filename);
        } finally {
            setGerando(false);
        }
    }

    const disabled = desabilitado || gerando || !jsPdfOk || logVisiveis.length === 0;

    return (
        <button
            onClick={gerarPdf}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
            title="Baixar PDF"
        >
            {gerando ? "Gerando…" : "Baixar PDF"}
        </button>
    );
}
