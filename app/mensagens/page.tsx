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

// Sempre passe pelos proxies para evitar CORS e manter cookies
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

    // helper: fetch -> base64
    async function toDataURL(url: string): Promise<string> {
        try {
            const resp = await fetch(url, { credentials: "include" });
            if (!resp.ok) throw new Error("img fetch fail");
            const blob = await resp.blob();
            return await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result));
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
        } catch {
            return FALLBACK_IMG;
        }
    }

    // ===== Fonte Nunito no jsPDF =====
    const nunitoLoadedRef = useRef(false);
    async function ensureNunito(doc: any) {
        if (nunitoLoadedRef.current) return;
        // TTFs via jsDelivr (@fontsource)
        const regularUrl =
            "https://cdn.jsdelivr.net/npm/@fontsource/nunito@5.0.8/files/nunito-latin-400-normal.ttf";
        const boldUrl =
            "https://cdn.jsdelivr.net/npm/@fontsource/nunito@5.0.8/files/nunito-latin-700-normal.ttf";

        async function fetchTTF(u: string) {
            const r = await fetch(u);
            const b = await r.arrayBuffer();
            // arrayBuffer -> base64
            let binary = "";
            const bytes = new Uint8Array(b);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

        const [regB64, boldB64] = await Promise.all([fetchTTF(regularUrl), fetchTTF(boldUrl)]);

        doc.addFileToVFS("Nunito-Regular.ttf", regB64);
        doc.addFont("Nunito-Regular.ttf", "Nunito", "normal");

        doc.addFileToVFS("Nunito-Bold.ttf", boldB64);
        doc.addFont("Nunito-Bold.ttf", "Nunito", "bold");

        nunitoLoadedRef.current = true;
    }

    // ------- Exportar PDF: jsPDF + Nunito + margens internas melhores -------
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
        // Garante Nunito
        await ensureNunito(doc);

        const pageW = doc.internal.pageSize.getWidth();  // 210
        const pageH = doc.internal.pageSize.getHeight(); // 297

        // Margens externas mais generosas
        const marginL = 14;
        const marginR = 14;
        const contentW = pageW - marginL - marginR;

        // Estilo base
        doc.setFont("Nunito", "normal");
        let y = 22;

        // Título
        doc.setFont("Nunito", "bold");
        doc.setFontSize(18);
        doc.text(`Mensagens Aprovadas — Sala 0${room}`, pageW / 2, y, { align: "center" });
        y += 8;

        // Data
        doc.setFont("Nunito", "normal");
        doc.setFontSize(11);
        doc.text(new Date().toLocaleString("pt-BR"), pageW / 2, y, { align: "center" });
        y += 12;

        // Layout do card
        const cardPadX = 6; // padding interno horizontal
        const cardPadY = 6; // padding interno vertical
        const gap = 6;      // gap entre nome e texto (maior que antes)
        const imgSize = 24; // mm

        for (const m of approved) {
            // Título (nome) + corpo (texto) ocuparão:
            // - imagem à esquerda com padding
            // - nome (bold) com espaçamento maior do corpo
            const innerX = marginL + cardPadX;
            const imgX = innerX;
            const imgY = y + cardPadY;
            const textX = innerX + imgSize + 6; // 6mm depois da imagem
            const textMaxW = contentW - (textX - marginL) - cardPadX; // respeita padding direito

            // Calcular linhas de texto
            doc.setFont("Nunito", "bold");
            doc.setFontSize(12);
            const nameLines = doc.splitTextToSize(m.name || "", textMaxW);
            const nameH = nameLines.length * 5;

            doc.setFont("Nunito", "normal");
            doc.setFontSize(11);
            const bodyLines = doc.splitTextToSize(m.text || "", textMaxW);
            const bodyH = Math.max(0, bodyLines.length * 5);

            // Altura do bloco (imagem x textos) + paddings
            const contentHeight = Math.max(imgSize, nameH + gap + bodyH);
            const cardH = contentHeight + cardPadY * 2;

            // quebra de página
            if (y + cardH + 6 > pageH) {
                doc.addPage();
                y = 22;
            }

            // Card
            doc.setDrawColor(210);
            doc.setLineWidth(0.25);
            doc.roundedRect(marginL, y, contentW, cardH, 3, 3);

            // Imagem
            try {
                const imgUrl = resolveImageSrc(m.image);
                const dataUrl = await toDataURL(imgUrl);
                doc.addImage(dataUrl, "JPEG", imgX, imgY, imgSize, imgSize, undefined, "FAST");
            } catch { /* ignore */ }

            // Nome (com boa distância do corpo)
            doc.setFont("Nunito", "bold");
            doc.setFontSize(12);
            doc.text(nameLines, textX, imgY + 2); // 2mm de respiro do topo
            const bodyStartY = imgY + nameH + gap;

            // Corpo
            doc.setFont("Nunito", "normal");
            doc.setFontSize(11);
            doc.text(bodyLines, textX, bodyStartY);

            // Avança
            y += cardH + 10; // espaço entre cards
        }

        doc.save(`mensagens_aprovadas_sala0${room}.pdf`);
    }, [approved, room]);

    return (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
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

                {approved.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                        Nenhuma mensagem aprovada nesta sala.
                    </div>
                ) : (
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
                )}
            </section>
        </div>
    );
}
