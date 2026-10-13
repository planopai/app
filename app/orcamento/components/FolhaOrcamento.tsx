"use client";

/*
 * Folha do orçamento na tela (14/10/2026): abre dentro do app, enquadrada na largura do aparelho (sem abrir a impressão),
 * com PDF para mandar à família e Imprimir.
 *
 * O PDF usa o mesmo gerador da folha da OS (app/os/components/pdfFolha, jsPDF no próprio aparelho): no celular abre o
 * Compartilhar (WhatsApp, e-mail...), no computador baixa o arquivo. A folha e o gerador são carregados ao abrir, porque o
 * iPhone só abre o Compartilhar logo depois do toque.
 */

import React, { useEffect, useRef, useState } from "react";
import { buscarFolhaHtml, urlFolha } from "./api";
import { Aviso, BTN_PRI, BTN_SEC, Ic, Icone, Janela, MUTED } from "./ui";

/** Largura em que a folha é desenhada (corpo de 720 px + margens); na tela ela é reduzida para caber. */
const LARGURA_FOLHA = 752;

const carregarGerador = () => import("@/app/os/components/pdfFolha");

export default function FolhaOrcamento({ id, numero, onFechar }: { id: number; numero: string; onFechar: () => void }) {
    const [html, setHtml] = useState("");
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [gerando, setGerando] = useState(false);
    const [largura, setLargura] = useState(0);
    const [altura, setAltura] = useState(0);
    const caixaRef = useRef<HTMLDivElement>(null);
    const quadroRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        let vivo = true;
        buscarFolhaHtml(id)
            .then((h) => vivo && setHtml(h))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível abrir a folha."));
        void carregarGerador().catch(() => {});
        return () => {
            vivo = false;
        };
    }, [id]);

    // Largura disponível na janela (muda ao girar o celular)
    useEffect(() => {
        const el = caixaRef.current;
        if (!el) return;
        const medir = () => setLargura(el.clientWidth);
        medir();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
        ro?.observe(el);
        window.addEventListener("resize", medir);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", medir);
        };
    }, [html]);

    const medirAltura = () => {
        const doc = quadroRef.current?.contentDocument;
        if (!doc?.body) return;
        // Altura = fim do texto (como a folha da OS): mede o corpo, não o documento (o documento nunca fica menor que o quadro).
        const c = doc.defaultView?.getComputedStyle(doc.body);
        const h = Math.ceil(doc.body.getBoundingClientRect().height + parseFloat(c?.marginTop || "0") + parseFloat(c?.marginBottom || "0"));
        if (h > 0) setAltura(h);
    };

    const escala = largura > 0 ? Math.min(1, largura / LARGURA_FOLHA) : 1;
    const nomeArquivo = `Orcamento-${numero.replace(/[^\w-]+/g, "-")}.pdf`;

    const pdf = async () => {
        if (!html || gerando) return;
        setGerando(true);
        setMsg("");
        try {
            const { pdfDaFolhaHtml } = await carregarGerador();
            const blob = await pdfDaFolhaHtml(html, numero);
            const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
            const nav = navigator as any;
            if (nav.canShare && nav.canShare({ files: [arquivo] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                try {
                    await nav.share({ files: [arquivo], title: nomeArquivo });
                    return;
                } catch (e: any) {
                    if (e?.name === "AbortError") return;
                    // toque "expirado" no iPhone: segue para baixar o arquivo
                }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = nomeArquivo;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: any) {
            setMsg(`Não foi possível gerar o PDF: ${e?.message || e}`);
        } finally {
            setGerando(false);
        }
    };

    return (
        <Janela
            titulo={`Folha ${numero}`}
            subtitulo="PDF para mandar à família ou Imprimir."
            onFechar={onFechar}
            largura="max-w-3xl"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={() => window.open(urlFolha(id, true), "_blank")}>
                        <Icone d={Ic.imprimir} />
                        Imprimir
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void pdf()} disabled={!html || gerando}>
                        <Icone d={Ic.folha} />
                        {gerando ? "Gerando…" : "PDF"}
                    </button>
                </>
            }
        >
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
            {msg ? (
                <div className="mb-3">
                    <Aviso tom="erro">{msg}</Aviso>
                </div>
            ) : null}
            {!html && !erro ? <p className={`py-6 text-center text-sm ${MUTED}`}>Carregando a folha…</p> : null}
            <div ref={caixaRef} className="w-full min-w-0 overflow-hidden">
                {html ? (
                    <div className="overflow-hidden rounded-xl border border-[#E3E8F0] bg-white dark:border-white/[0.12]" style={{ height: altura ? Math.ceil(altura * escala) + 2 : 400 }}>
                        <iframe
                            ref={quadroRef}
                            title={`Folha do orçamento ${numero}`}
                            srcDoc={html}
                            onLoad={() => {
                                medirAltura();
                                setTimeout(medirAltura, 400);
                                quadroRef.current?.contentDocument?.fonts?.ready.then(medirAltura).catch(() => {});
                            }}
                            scrolling="no"
                            style={{ width: LARGURA_FOLHA, height: altura || 1200, border: 0, display: "block", transform: `scale(${escala})`, transformOrigin: "0 0", background: "#FFFFFF" }}
                        />
                    </div>
                ) : null}
            </div>
        </Janela>
    );
}
