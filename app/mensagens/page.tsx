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
        <div className="flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm sm:p-4">
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

    // Modal & geração
    const [showModal, setShowModal] = useState(false);
    const [falecido, setFalecido] = useState("");
    const [nascimento, setNascimento] = useState(""); // yyyy-mm-dd
    const [falecimento, setFalecimento] = useState(""); // yyyy-mm-dd
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState("");

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

    // ===== Fontes =====
    // DejaVu (Unicode) – para o miolo com emojis
    const djvStateRef = useRef<"none" | "ok" | "fail">("none");
    async function ensureDejaVu(doc: any): Promise<boolean> {
        if (djvStateRef.current === "ok") return true;
        if (djvStateRef.current === "fail") return false;
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
            djvStateRef.current = "ok";
            return true;
        } catch {
            djvStateRef.current = "fail";
            return false;
        }
    }
    // Nunito – para a capa
    const nunitoStateRef = useRef<"none" | "ok" | "fail">("none");
    async function ensureNunito(doc: any): Promise<boolean> {
        if (nunitoStateRef.current === "ok") return true;
        if (nunitoStateRef.current === "fail") return false;
        try {
            const regularUrl =
                "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Regular.ttf";
            const boldUrl =
                "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Bold.ttf";
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
            doc.addFileToVFS("Nunito-Regular.ttf", regB64);
            doc.addFont("Nunito-Regular.ttf", "Nunito", "normal");
            doc.addFileToVFS("Nunito-Bold.ttf", boldB64);
            doc.addFont("Nunito-Bold.ttf", "Nunito", "bold");
            nunitoStateRef.current = "ok";
            return true;
        } catch {
            nunitoStateRef.current = "fail";
            return false;
        }
    }

    // --- Sanitização robusta p/ PDF (evita bugs com emojis)
    const sanitizeForPdf = (input?: string) => {
        let s = (input ?? "").normalize("NFC");
        s = s.replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ");
        s = s.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\uFE0F/g, "");
        s = s.replace(/([#*0-9])\uFE0F?\u20E3/gu, "$1"); // keycaps
        s = s.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, "•"); // flags
        s = s.replace(
            /[\u2764\u2665\u2661\u{1F494}\u{1F493}\u{1F495}-\u{1F49F}\u{1F9E1}\u{1FA77}]/gu,
            "♥"
        );
        try {
            s = s.replace(/\p{Extended_Pictographic}/gu, "•");
        } catch {
            s = s.replace(/[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/gu, "•");
        }
        return s;
    };

    // helper: mede e desenha linha-a-linha
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
        const clean = sanitizeForPdf(text);
        doc.setFont(fontName, fontStyle);
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(clean, maxW) as string[];
        const mmPerPt = 0.352777778;
        const lh = fontSize * 1.15 * mmPerPt;
        const height = Math.max(lh * lines.length, lh);
        if (draw) {
            if (typeof (doc as any).setCharSpace === "function") (doc as any).setCharSpace(0);
            let cy = y;
            for (const ln of lines) {
                doc.text(ln, x, cy, { baseline: "top", align: "left" });
                cy += lh;
            }
        }
        return { lines, height, lineHeight: lh };
    }

    const formatDateBR = (iso: string) => {
        if (!iso) return "";
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
    };

    // ------- Exportar PDF (com modal) -------
    const runExport = useCallback(
        async (meta: { nome: string; nasc: string; obito: string }) => {
            const w: any = window as any;
            const jspdf = w.jspdf;
            if (!jspdf || !jspdf.jsPDF) {
                throw new Error("Ferramenta de PDF ainda carregando. Tente novamente.");
            }
            const { jsPDF } = jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

            // Dimensões
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const centerX = pageW / 2;

            // >>> CONFIGS DA CAPA (ajuste aqui quando quiser) <<<
            const NAME_SIZE = 48; // tamanho do NOME
            const DATE_SIZE = 24; // tamanho das DATAS

            // Progresso – 0%
            setProgress(5);
            setProgressMsg("Carregando fontes…");

            // fontes
            const nunitoOk = await ensureNunito(doc); // capa
            const dejaOk = await ensureDejaVu(doc); // miolo
            const CONTENT_FONT = dejaOk ? "Nunito" : "helvetica"; // <<< miolo
            const COVER_FONT = nunitoOk ? "Nunito" : "helvetica"; // <<< capa

            setProgress(15);
            setProgressMsg("Carregando imagens de capa…");

            // CAPA (página 1)
            const capa = await toDataURL("/capa.png");
            doc.addImage(capa, "PNG", 0, 0, pageW, pageH, undefined, "FAST");

            // Título (nome + datas)
            doc.setTextColor(34, 51, 80); // #223350
            doc.setFont(COVER_FONT, "bold");
            doc.setFontSize(NAME_SIZE);
            const maxTitleW = pageW * 0.8;
            const nameLines = doc.splitTextToSize(meta.nome, maxTitleW) as string[];
            const mmPerPt = 0.352777778;
            const nameLH = NAME_SIZE * 1.15 * mmPerPt;
            const blockH = nameLH * nameLines.length;
            let nameY = pageH * 0.42 - blockH / 2;
            (doc as any).text(nameLines, centerX, nameY, { align: "center", baseline: "top" });

            // Datas
            const dtY = nameY + blockH + 8;
            const d1 = formatDateBR(meta.nasc);
            const d2 = formatDateBR(meta.obito);
            doc.setFont(COVER_FONT, "normal");
            doc.setFontSize(DATE_SIZE);
            const gap = 24;
            const w1 = doc.getTextWidth(d1);
            const w2 = doc.getTextWidth(d2);
            doc.text(d1, centerX - gap - w1 / 2, dtY, { baseline: "top" });
            doc.text(d2, centerX + gap - w2 / 2, dtY, { baseline: "top" });

            // CONTRACAPAS (páginas 2 e 3)
            setProgress(25);
            setProgressMsg("Carregando contracapas…");
            const contracapa = await toDataURL("/contracapa.png");
            const contracapa2 = await toDataURL("/contracapa02.png");
            doc.addPage();
            doc.addImage(contracapa, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
            doc.addPage();
            doc.addImage(contracapa2, "PNG", 0, 0, pageW, pageH, undefined, "FAST");

            // Páginas de mensagens (4+)
            setProgress(35);
            setProgressMsg("Preparando páginas de mensagens…");

            const bgData = await toDataURL("/fundo.png");
            const startContentPage = () => {
                doc.addPage();
                doc.addImage(bgData, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
            };
            // primeira de conteúdo (página 4)
            startContentPage();

            // Margens & layout
            const margin = { top: 16, right: 14, bottom: 16, left: 14 };
            const contentW = pageW - margin.left - margin.right;

            // 4 cards por página
            const cardsPerPage = 4;
            const gapY = 8;
            const minCardH = 36;
            const maxCardH = 56;
            const availH = pageH - margin.top - margin.bottom;
            const baseH = (availH - gapY * (cardsPerPage - 1)) / cardsPerPage;
            const cardH = Math.max(minCardH, Math.min(maxCardH, baseH));

            // Card
            const cardPadX = 8;
            const cardPadY = 8;
            const cornerRadius = 6;
            const borderWidth = 0.6;

            // Interno
            const imgSize = 26;
            const innerGap = 8;
            const nameBodyGap = 6;

            // Tipografia miolo
            const titleStart = 12;
            const bodyStart = 11;
            const bodyMin = 9;

            const total = Math.max(approved.length, 1);
            for (let i = 0; i < approved.length; i++) {
                const m = approved[i];
                const idx = i % cardsPerPage;
                if (i > 0 && idx === 0) startContentPage();

                const cardX = margin.left;
                const cardY = margin.top + idx * (cardH + gapY);

                // fundo branco + borda
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(210);
                doc.setLineWidth(borderWidth);
                doc.roundedRect(cardX, cardY, contentW, cardH, cornerRadius, cornerRadius, "FD");

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

                // Nome
                let titleSize = titleStart;
                let { height: nameH } = wrapText(
                    doc,
                    m.name || "",
                    textX,
                    textTop,
                    textMaxW,
                    CONTENT_FONT,
                    "bold",
                    titleSize,
                    false
                );

                // Corpo
                let bodySize = bodyStart;
                let body = wrapText(
                    doc,
                    m.text || "",
                    textX,
                    textTop + nameH + nameBodyGap,
                    textMaxW,
                    CONTENT_FONT,
                    "normal",
                    bodySize,
                    false
                );

                // Ajuste para caber
                while (nameH + nameBodyGap + body.height > maxH && bodySize > bodyMin) {
                    bodySize -= 0.5;
                    body = wrapText(
                        doc,
                        m.text || "",
                        textX,
                        textTop + nameH + nameBodyGap,
                        textMaxW,
                        CONTENT_FONT,
                        "normal",
                        bodySize,
                        false
                    );
                }

                // Ellipsis se ainda exceder
                if (nameH + nameBodyGap + body.height > maxH) {
                    const mmPerPt2 = 0.352777778;
                    const lh = bodySize * 1.15 * mmPerPt2;
                    const maxBodyH = maxH - nameH - nameBodyGap;
                    const maxLines = Math.max(0, Math.floor(maxBodyH / lh));
                    let clean = (sanitizeForPdf(m.text || "") || "");
                    let lines = (doc.splitTextToSize(clean, textMaxW) as string[]).slice(0, maxLines);
                    if (lines.length && maxLines > 0) {
                        lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, "") + "…";
                    }
                    body = { lines, height: Math.max(lh * lines.length, 0), lineHeight: lh };
                }

                // Desenhar textos
                wrapText(doc, m.name || "", textX, textTop, textMaxW, CONTENT_FONT, "bold", titleSize, true);
                doc.setFont(CONTENT_FONT, "normal");
                doc.setFontSize(bodySize);
                let y = textTop + nameH + nameBodyGap;
                for (const ln of body.lines) {
                    doc.text(ln, textX, y, { baseline: "top", align: "left" });
                    y += body.lineHeight;
                }

                // progresso
                const pct = 35 + Math.round(((i + 1) / total) * 60);
                setProgress(pct);
                setProgressMsg(`Gerando mensagens (${i + 1}/${total})…`);
            }

            setProgress(98);
            setProgressMsg("Finalizando documento…");

            doc.save(`livro_homenagens_sala0${room}.pdf`);
            setProgress(100);
            setProgressMsg("Concluído!");
        },
        [approved, room]
    );

    const onOpenModal = () => {
        setShowModal(true);
        setProgress(0);
        setProgressMsg("");
    };

    const onSubmitGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!falecido.trim()) {
            alert("Informe o nome do falecido.");
            return;
        }
        try {
            setGenerating(true);
            setProgress(1);
            setProgressMsg("Iniciando…");
            await runExport({ nome: falecido.trim(), nasc: nascimento, obito: falecimento });
            setGenerating(false);
            setShowModal(false);
        } catch (err: any) {
            setGenerating(false);
            setProgress(0);
            setProgressMsg("");
            alert(err?.message || "Falha ao gerar o PDF.");
        }
    };

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
                    {approved.length > 0 && (
                        <button
                            type="button"
                            onClick={onOpenModal}
                            className={btn}
                            title="Gerar Livro de Homenagens"
                        >
                            <IconDownload className="size-4" />
                            Exportar PDF
                        </button>
                    )}
                </div>

                {approved.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                        Não há mensagem aprovada nesta sala.
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

            {/* MODAL – Gerar Livro */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4">
                            <h3 className="text-xl font-semibold">Gerar Livro de Homenagens</h3>
                            <p className="text-sm text-muted-foreground">
                                Informe os dados para personalizar a capa (página 1).
                            </p>
                        </div>

                        <form onSubmit={onSubmitGenerate} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium">Nome do falecido</label>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                    value={falecido}
                                    onChange={(e) => setFalecido(e.target.value)}
                                    placeholder="Ex.: João Batista de Jesus"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-medium">Nascimento</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                        value={nascimento}
                                        onChange={(e) => setNascimento(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Falecimento</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                        value={falecimento}
                                        onChange={(e) => setFalecimento(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Progresso */}
                            {generating ? (
                                <div className="rounded-md border bg-muted/20 p-3">
                                    <div className="mb-2 text-sm">{progressMsg}</div>
                                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                                        <div
                                            className="h-full bg-blue-600 transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={generating}
                                    onClick={() => setShowModal(false)}
                                    className="rounded-md border px-3 py-2 text-sm"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={generating}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                                >
                                    Gerar Livro de Homenagens
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
