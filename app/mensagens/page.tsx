"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconMessageCircle2,
    IconCheck,
    IconTrash,
    IconRefresh,
    IconDoor,
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

// Endpoints por sala (ajuste se usar /api/php/...)
const fetchMap: Record<Room, string> = {
    1: "https://planoassistencialintegrado.com.br/fetchMessages.php",
    2: "https://planoassistencialintegrado.com.br/fetchMessages2.php",
    3: "https://planoassistencialintegrado.com.br/fetchMessages3.php",
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

// Botão outline bonito
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
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 shadow-sm sm:p-4">
            <img
                src={item.image || FALLBACK_IMG}
                alt={item.name}
                className="size-16 rounded-md border object-cover sm:size-20"
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
            const res = await fetch(fetchUrl, { cache: "no-store" });
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
            await fetch(approveUrl(id), { method: "POST" });
            await loadMessages();
        } catch {
            alert("Erro ao aprovar a mensagem.");
        }
    };

    const deleteMessage = async (id: number, type: "received" | "approved") => {
        try {
            await fetch(deleteUrl(id, type), { method: "POST" });
            await loadMessages();
        } catch {
            alert("Erro ao excluir a mensagem.");
        }
    };

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    return (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
            {/* Topbar: título à esquerda, ações à direita */}
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

            {/* Card com botões de sala */}
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
                                            className="btn border gap-2 hover:bg-green-50 dark:hover:bg-green-900/20"
                                            title="Aprovar"
                                        >
                                            <IconCheck className="size-4 text-green-600" />
                                            Aprovar
                                        </button>
                                        <button
                                            onClick={() => deleteMessage(m.id, "received")}
                                            className="btn border gap-2 hover:bg-red-50 dark:hover:bg-red-900/20"
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
                <div className="mb-3 flex items-center gap-2">
                    <IconMessageCircle2 className="size-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Mensagens Aprovadas</h2>
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
                                        className="btn border gap-2 hover:bg-red-50 dark:hover:bg-red-900/20"
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
