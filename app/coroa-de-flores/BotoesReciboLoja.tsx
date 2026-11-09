"use client";

/* 09/11/2026: Recibo do pedido da Loja On-line no "Ver" do pedido de coroa — Visualizar, Baixar e Compartilhar. */

import React, { useState } from "react";
import { obterReciboLoja } from "./reciboLoja";

const btn =
    "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-bold text-[#313C55] hover:bg-muted disabled:opacity-50 dark:text-white";

export default function BotoesReciboLoja({ pedidoLojaId }: { pedidoLojaId?: string | number | null }) {
    const [gerando, setGerando] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const id = String(pedidoLojaId ?? "").trim();
    if (!id) return null;

    async function gerar() {
        setGerando(true);
        setMsg(null);
        try {
            return await obterReciboLoja(id);
        } catch (e: any) {
            setMsg(e?.message || "Não foi possível gerar o recibo.");
            return null;
        } finally {
            setGerando(false);
        }
    }

    async function visualizar() {
        // Abre a aba antes de gerar (o navegador do celular bloqueia janela aberta depois de esperar).
        const aba = window.open("", "_blank");
        const r = await gerar();
        if (!r) {
            aba?.close();
            return;
        }
        const url = URL.createObjectURL(r.blob);
        if (aba) aba.location.href = url;
        else window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function baixar(r?: { blob: Blob; nomeArquivo: string } | null) {
        const rec = r ?? (await gerar());
        if (!rec) return;
        const url = URL.createObjectURL(rec.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = rec.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }

    async function compartilhar() {
        const r = await gerar();
        if (!r) return;
        const arquivo = new File([r.blob], r.nomeArquivo, { type: "application/pdf" });
        const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
        if (nav.share && nav.canShare?.({ files: [arquivo] })) {
            try {
                await nav.share({ files: [arquivo], title: `Recibo do pedido #${id}` });
            } catch {
                /* cancelado */
            }
            return;
        }
        await baixar(r);
        setMsg("PDF baixado. Anexe o arquivo no WhatsApp ou no e-mail.");
    }

    return (
        <div className="mt-2">
            <div className="mb-1 text-xs font-medium">Recibo da loja (pedido #{id})</div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={btn} disabled={gerando} onClick={() => void visualizar()}>
                    {gerando ? "Gerando…" : "Visualizar"}
                </button>
                <button type="button" className={btn} disabled={gerando} onClick={() => void baixar()}>
                    Baixar
                </button>
                <button type="button" className={btn} disabled={gerando} onClick={() => void compartilhar()}>
                    Compartilhar
                </button>
            </div>
            {msg && <div className="mt-1 text-xs text-muted-foreground">{msg}</div>}
        </div>
    );
}
