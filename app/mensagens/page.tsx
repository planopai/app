"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconMessageCircle2,
    IconCheck,
    IconTrash,
    IconRefresh,
    IconDoor,
    IconDownload,
} from "@tabler/icons-react";

type Room = 1 | 2 | 3;

type MessageItem = {
    id: number;
    name: string;
    text: string;
    image?: string | null;
};

type ApiResponse = {
    receivedMessages: MessageItem[];
    approvedMessages: MessageItem[];
};

const FALLBACK_IMG = "https://via.placeholder.com/100";

// Proxies (evitam CORS e mantêm cookies)
const fetchMap: Record<Room, string> = {
    1: "/api/php/fetchMessages.php",
    2: "/api/php/fetchMessages2.php",
    3: "/api/php/fetchMessages3.php",
};
const approveMap: Record<Room, (id: number) => string> = {
    1: (id) => `/api/php/approveMessage.php?id=${id}`,
    2: (id) => `/api/php/approveMessage2.php?id=${id}`,
    3: (id) => `/api/php/approveMessage3.php?id=${id}`,
};
const deleteMap: Record<Room, (id: number, type: "received" | "approved") => string> = {
    1: (id, t) => `/api/php/deleteMessage.php?id=${id}&type=${t}`,
    2: (id, t) => `/api/php/deleteMessage2.php?id=${id}&type=${t}`,
    3: (id, t) => `/api/php/deleteMessage3.php?id=${id}&type=${t}`,
};

function resolveImageSrc(src?: string | null): string {
    if (!src) return FALLBACK_IMG;
    let s = src.trim();
    if (!s) return FALLBACK_IMG;
    if (/^(data:|blob:|https?:\/\/)/i.test(s)) return s;
    s = s.replace(/^\.?\//, "");
    return `/api/php/${s}`;
}

const btn =
    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
    "border-primary text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50";

function RoomButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={[
                "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 font-semibold transition",
                active
                    ? "border-primary/70 bg-primary/5 text-primary ring-1 ring-primary/30"
                    : "border-muted text-foreground hover:bg-muted/40",
            ].join(" ")}
        >
            <IconDoor className="size-4" />
            {label}
        </button>
    );
}

function MessageCard({
    item,
    actions,
}: {
    item: MessageItem;
    actions?: React.ReactNode;
}) {
    const src = resolveImageSrc(item.image);
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 shadow-sm sm:p-4">
            <img
                src={src}
                alt={item.name}
                className="size-16 rounded-md border object-cover sm:size-20"
                loading="lazy"
                onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
                }}
            />
            <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{item.name}</div>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {item.text}
                </p>
                {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
            </div>
        </div>
    );
}

export default function MensagensPage() {
    const [room, setRoom] = useState<Room>(1);
    const [loading, setLoading] = useState(false);
    const [received, setReceived] = useState<MessageItem[]>([]);
    const [approved, setApproved] = useState<MessageItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Carrega jsPDF (UMD)
    useEffect(() => {
        const KEY = "__jspdf_loaded__";
        if ((window as any)[KEY]) return;
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
    }, []);

    const fetchUrl = useMemo(() => `${fetchMap[room]}?cb=${Date.now()}`, [room]);
    const approveUrl = useCallback((id: number) => approveMap[room](id), [room]);
    const deleteUrl = useCallback(
        (id: number, type: "received" | "approved") => deleteMap[room](id, type),
        [room]
    );

    const loadMessages = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(fetchUrl, { cache: "no-store", credentials: "include" });
            if (!res.ok) throw new Error("Falha ao carregar mensagens.");
            const data: ApiResponse = await res.json();
            setReceived(data.receivedMessages || []);
            setApproved(data.approvedMessages || []);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar mensagens.");
            setReceived([]);
            setApproved([]);
        } finally {
            setLoading(false);
        }
    }, [fetchUrl]);

    const approveMessage = async (id: number) => {
        try {
            await fetch(approveUrl(id), { method: "POST", credentials: "include" });
            await loadMessages();
        } catch {
            alert("Erro ao aprovar a mensagem.");
        }
    };

    const deleteMessage = async (id: number, type: "received" | "approved") => {
        try {
            await fetch(deleteUrl(id, type), { method: "POST", credentials: "include" });
            await loadMessages();
        } catch {
            alert("Erro ao excluir a mensagem.");
        }
    };

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    // ===== util: cache simples de dataURLs =====
    const dataUrlCache = useRef<Map<string, string>>(new Map());
    async function toDataURL(url: string): Promise<string> {
        const cache = dataUrlCache.current;
        if (cache.has(url)) return cache.get(url)!;
        try {
            const resp = await fetch(url, { credentials: "include" });
            if (!resp.ok) throw new Error("img fetch fail");
            const blob = await resp.blob();
            const dataUrl: string = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result));
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
            cache.set(url, dataUrl);
            return dataUrl;
        } catch {
            return FALLBACK_IMG;
        }
    }

    // ===== Fonte Unicode (DejaVu Sans) para PDF =====
    const fontStateRef = useRef<"none" | "ok" | "fail">("none");
    async function ensureDejaVu(doc: any): Promise<boolean> {
        if (fontStateRef.current === "ok") return true;
        if (fontStateRef.current === "fail") return false;
        try {
            const regularUrl =
                "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts-ttf@2.37/ttf/DejaVuSans.ttf";
            const boldUrl =
                "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts-ttf@2.37/ttf/DejaVuSans-Bold.ttf";

            async function fetchTTF(u: string) {
                const r = await fetch(u);
                if (!r.ok) throw new Error("Fonte não encontrada");
                const b = await r.arrayBuffer();
                let binary = "";
                const bytes = new Uint8Array(b);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            }

            const [regB64, boldB64] = await Promise.all([fetchTTF(regularUrl), fetchTTF(boldUrl)]);

            doc.addFileToVFS("DejaVuSans.ttf", regB64);
            doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");

            doc.addFileToVFS("DejaVuSans-Bold.ttf", boldB64);
            doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");

            fontStateRef.current = "ok";
            return true;
        } catch {
            fontStateRef.current = "fail";
            return false;
        }
    }

    // Sanitização leve + normalização (evita espaçamentos estranhos)
    const normalizeForPdf = (s?: string) =>
        (s ?? "")
            .normalize("NFC")
            .replace(/\r\n?/g, "\n")
            .replace(/\u00A0/g, " ")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\uFE0F/g, ""); // VS16

    // helper: mede e devolve linhas/altura; desenha linha-a-linha
    function wrapText(
        doc: any,
        text: string,
        x: number,
        y: number,
        maxW: number,
        fontName: string,
        fontStyle: "normal" | "bold",
        fontSize: number,
        draw: boolean
    ) {
        doc.setFont(fontName, fontStyle);
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(normalizeForPdf(text), maxW) as string[];
        const mmPerPt = 0.352777778;
        const lh = fontSize * 1.15 * mmPerPt;
        const height = Math.max(lh * lines.length, lh);
        if (draw) {
            // garante que não há charSpace aplicado
            if (typeof (doc as any).setCharSpace === "function") (doc as any).setCharSpace(0);
            let cy = y;
            for (const ln of lines) {
                doc.text(ln, x, cy, { baseline: "top", align: "left" });
                cy += lh;
            }
        }
        return { lines, height, lineHeight: lh };
    }

    // ------- Exportar PDF (capas 1–3; mensagens a partir da 4 com fundo global; 4 por página) -------
    const exportApprovedPdf = useCallback(async () => {
        if (approved.length === 0) {
            alert("Não há mensagens aprovadas para exportar.");
            return;
        }

        const w: any = window as any;
        const jspdf = w.jspdf;
        if (!jspdf || !jspdf.jsPDF) {
            alert("Ferramenta de PDF ainda carregando. Tente novamente em alguns segundos.");
            return;
        }
        const { jsPDF } = jspdf;

        const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

        // garante fonte Unicode
        const hasDejaVu = await ensureDejaVu(doc);
        const FONT = hasDejaVu ? "DejaVuSans" : "helvetica";

        // Dimensões
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        // Margens & layout
        const margin = { top: 16, right: 14, bottom: 16, left: 14 };
        const contentW = pageW - margin.left - margin.right;

        // Grade fixa: 4 cards por página
        const cardsPerPage = 4;
        const gapY = 8; // espaço vertical entre cards

        // Card (altura fixa para layout uniforme)
        const minCardH = 36;
        const maxCardH = 56;
        const availH = pageH - margin.top - margin.bottom;
        const baseH = (availH - gapY * (cardsPerPage - 1)) / cardsPerPage;
        const cardH = Math.max(minCardH, Math.min(maxCardH, baseH));

        // Aparência do card
        const cardPadX = 8;
        const cardPadY = 8;
        const cornerRadius = 3;
        const borderWidth = 0.25;

        // Layout interno
        const imgSize = 26;
        const innerGap = 8;
        const nameBodyGap = 6;

        // Tipografia (reduz se necessário)
        const titleStart = 12; // pt
        const bodyStart = 11;  // pt
        const bodyMin = 9;     // pt

        // ---------- 1) CAPAS (páginas 1, 2 e 3) ----------
        const covers = ["/capa.png", "/contracapa.png", "/contracapa02.png"];
        for (let i = 0; i < covers.length; i++) {
            if (i > 0) doc.addPage();
            const coverData = await toDataURL(covers[i]);
            doc.addImage(coverData, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
        }

        // ---------- 2) Página 4 em diante: fundo global + 4 cards por página ----------
        const bgData = await toDataURL("/fundo.png");
        const startContentPage = () => {
            doc.addPage();
            doc.addImage(bgData, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
        };
        // cria a página 4
        startContentPage();

        for (let i = 0; i < approved.length; i++) {
            const m = approved[i];
            const idx = i % cardsPerPage;
            if (i > 0 && idx === 0) startContentPage();

            const cardX = margin.left;
            const cardY = margin.top + idx * (cardH + gapY);

            // contorno do card
            doc.setDrawColor(210);
            doc.setLineWidth(borderWidth);
            doc.roundedRect(cardX, cardY, contentW, cardH, cornerRadius, cornerRadius);

            // imagem
            const imgX = cardX + cardPadX;
            const imgY = cardY + cardPadY;
            try {
                const imgUrl = resolveImageSrc(m.image);
                const imgData = await toDataURL(imgUrl);
                doc.addImage(imgData, "JPEG", imgX, imgY, imgSize, imgSize, undefined, "FAST");
            } catch { }

            // área de texto
            const textX = imgX + imgSize + innerGap;
            const textTop = cardY + cardPadY;
            const textMaxW = contentW - (textX - cardX) - cardPadX;
            const maxH = cardH - 2 * cardPadY;

            // NOME
            let titleSize = titleStart;
            let { lines: nameLines, height: nameH, lineHeight: titleLH } = wrapText(
                doc,
                m.name || "",
                textX,
                textTop,
                textMaxW,
                FONT,
                "bold",
                titleSize,
                false
            );

            // CORPO
            let bodySize = bodyStart;
            let body = wrapText(
                doc,
                m.text || "",
                textX,
                textTop + nameH + nameBodyGap,
                textMaxW,
                FONT,
                "normal",
                bodySize,
                false
            );

            // Ajuste para caber dentro do card
            while (nameH + nameBodyGap + body.height > maxH && bodySize > bodyMin) {
                bodySize -= 0.5;
                body = wrapText(
                    doc,
                    m.text || "",
                    textX,
                    textTop + nameH + nameBodyGap,
                    textMaxW,
                    FONT,
                    "normal",
                    bodySize,
                    false
                );
            }

            // Se ainda não couber, corta com reticências
            if (nameH + nameBodyGap + body.height > maxH) {
                const mmPerPt = 0.352777778;
                const lh = bodySize * 1.15 * mmPerPt;
                const maxBodyH = maxH - nameH - nameBodyGap;
                const maxLines = Math.max(0, Math.floor(maxBodyH / lh));
                let lines = (doc.splitTextToSize(normalizeForPdf(m.text || ""), textMaxW) as string[]).slice(
                    0,
                    maxLines
                );
                if (lines.length && maxLines > 0) {
                    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, "") + "…";
                }
                // redesenha body com as linhas cortadas
                body = {
                    lines,
                    height: Math.max(lh * lines.length, 0),
                    lineHeight: lh,
                };
            }

            // DESENHAR (linha-a-linha SEM maxWidth → nunca estoura)
            // Nome
            wrapText(doc, m.name || "", textX, textTop, textMaxW, FONT, "bold", titleSize, true);
            // Corpo
            // (já temos `body.lines` e `lineHeight`, então desenhamos manualmente)
            if (typeof (doc as any).setCharSpace === "function") (doc as any).setCharSpace(0);
            doc.setFont(FONT, "normal");
            doc.setFontSize(bodySize);
            let yy = textTop + nameH + nameBodyGap;
            for (const ln of body.lines) {
                doc.text(ln, textX, yy, { baseline: "top", align: "left" });
                yy += body.lineHeight;
            }
        }

        doc.save(`mensagens_aprovadas_sala0${room}.pdf`);
    }, [approved, room]);

    return (
        <div className="mx-auto w/full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
            {/* Topbar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold leading-tight">Filtro de Mensagens Recebidas</h1>
                    <p className="text-sm text-muted-foreground">
                        Selecione a sala e gerencie as mensagens recebidas e aprovadas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadMessages} className={btn} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Salas */}
            <div className="mb-5 rounded-2xl border bg-card/60 p-3 sm:p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <RoomButton label="Sala 01" active={room === 1} onClick={() => setRoom(1)} />
                    <RoomButton label="Sala 02" active={room === 2} onClick={() => setRoom(2)} />
                    <RoomButton label="Sala 03" active={room === 3} onClick={() => setRoom(3)} />
                </div>
            </div>

            {/* Estado geral */}
            {loading && (
                <div className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    Carregando mensagens…
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            )}

            {/* Recebidas */}
            <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                    <IconMessageCircle2 className="size-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Mensagens Recebidas</h2>
                </div>

                {received.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                        Nenhuma mensagem recebida nesta sala.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {received.map((m) => (
                            <MessageCard
                                key={`r-${m.id}`}
                                item={m}
                                actions={
                                    <>
                                        <button
                                            onClick={() => approveMessage(m.id)}
                                            className={`${btn} hover:bg-green-50 dark:hover:bg-green-900/20`}
                                            title="Aprovar"
                                        >
                                            <IconCheck className="size-4 text-green-600" />
                                            Aprovar
                                        </button>
                                        <button
                                            onClick={() => deleteMessage(m.id, "received")}
                                            className={`${btn} hover:bg-red-50 dark:hover:bg-red-900/20`}
                                            title="Excluir"
                                        >
                                            <IconTrash className="size-4 text-red-600" />
                                            Excluir
                                        </button>
                                    </>
                                }
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Aprovadas */}
            <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <IconMessageCircle2 className="size-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Mensagens Aprovadas</h2>
                    </div>
                </div>

                {approved.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                        Não há mensagem aprovada nesta sala.
                    </div>
                ) : (
                    <>
                        <div className="mb-3">
                            <button
                                type="button"
                                onClick={exportApprovedPdf}
                                disabled={approved.length === 0}
                                className={btn}
                                title="Exportar PDF"
                            >
                                <IconDownload className="size-4" />
                                Exportar PDF
                            </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {approved.map((m) => (
                                <MessageCard
                                    key={`a-${m.id}`}
                                    item={m}
                                    actions={
                                        <button
                                            onClick={() => deleteMessage(m.id, "approved")}
                                            className={`${btn} hover:bg-red-50 dark:hover:bg-red-900/20`}
                                            title="Excluir"
                                        >
                                            <IconTrash className="size-4 text-red-600" />
                                            Excluir
                                        </button>
                                    }
                                />
                            ))}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
