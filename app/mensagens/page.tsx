"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

// sempre use o proxy local para manter cookies e evitar CORS
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

// resolve caminho da imagem (prioriza proxy) e lida com relativo
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

    // carrega html2pdf da CDN
    useEffect(() => {
        const KEY = "__html2pdf_loaded__";
        if ((window as any)[KEY]) return;
        const script = document.createElement("script");
        script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
        return () => {
            // não removo para evitar recarregar várias vezes ao navegar
        };
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
            const res = await fetch(fetchUrl, {
                cache: "no-store",
                credentials: "include",
            });
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

    // ------- Exportar PDF das mensagens aprovadas (organizado) -------
    const exportApprovedPdf = useCallback(async () => {
        if (approved.length === 0) {
            alert("Não há mensagens aprovadas para exportar.");
            return;
        }
        const win: any = window as any;
        const lib = win.html2pdf;
        if (!lib) {
            alert("Ferramenta de PDF ainda carregando. Tente novamente em alguns segundos.");
            return;
        }

        // container isolado, sem classes do app (evita OKLCH / variáveis)
        const wrapper = document.createElement("div");
        wrapper.setAttribute(
            "style",
            [
                "position:fixed",
                "left:-10000px",
                "top:0",
                "width:800px",
                "background:#ffffff",
                "color:#111111",
                "font-family:Arial, Helvetica, sans-serif",
                "font-size:14px",
                "line-height:1.4",
                "padding:16px",
            ].join(";")
        );

        // título
        const h1 = document.createElement("h1");
        h1.textContent = `Mensagens Aprovadas — Sala 0${room}`;
        h1.setAttribute(
            "style",
            "margin:0 0 8px 0;font-size:20px;font-weight:700;text-align:center;color:#111111;"
        );
        wrapper.appendChild(h1);

        // subtítulo (data/hora)
        const p = document.createElement("div");
        p.textContent = new Date().toLocaleString("pt-BR");
        p.setAttribute(
            "style",
            "text-align:center;margin:0 0 16px 0;color:#444444;font-size:12px;"
        );
        wrapper.appendChild(p);

        // lista de mensagens
        const list = document.createElement("div");
        list.setAttribute("style", "display:flex;flex-direction:column;gap:10px;");
        wrapper.appendChild(list);

        for (const m of approved) {
            const card = document.createElement("div");
            card.setAttribute(
                "style",
                [
                    "border:1px solid #dddddd",
                    "border-radius:8px",
                    "padding:10px",
                    "display:flex",
                    "gap:10px",
                    "page-break-inside:avoid",
                    "background:#ffffff",
                ].join(";")
            );

            // imagem (opcional)
            const img = document.createElement("img");
            img.setAttribute("alt", m.name || "imagem");
            img.setAttribute("crossorigin", "anonymous");
            const src = resolveImageSrc(m.image);
            img.setAttribute("src", src);
            img.setAttribute(
                "style",
                "width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;background:#fafafa;flex:0 0 auto;"
            );
            card.appendChild(img);

            // texto
            const block = document.createElement("div");
            block.setAttribute("style", "flex:1 1 auto;min-width:0;");

            const title = document.createElement("div");
            title.textContent = m.name || "";
            title.setAttribute("style", "font-weight:700;font-size:14px;color:#111111;margin-bottom:4px;");
            block.appendChild(title);

            const body = document.createElement("div");
            body.textContent = m.text || "";
            body.setAttribute(
                "style",
                "white-space:pre-wrap;word-break:break-word;color:#222222;font-size:13px;"
            );
            block.appendChild(body);

            card.appendChild(block);
            list.appendChild(card);
        }

        document.body.appendChild(wrapper);

        try {
            await lib()
                .set({
                    margin: [12, 10, 16, 10],
                    filename: `mensagens_aprovadas_sala0${room}.pdf`,
                    image: { type: "jpeg", quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollY: 0 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                    pagebreak: { mode: ["css", "legacy", "avoid-all"] },
                })
                .from(wrapper)
                .save();
        } catch (err) {
            console.error("Falha ao gerar PDF:", err);
            alert("Falha ao gerar PDF. Veja o console para detalhes.");
        } finally {
            try {
                document.body.removeChild(wrapper);
            } catch { }
        }
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
