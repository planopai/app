"use client";

import React, {
    FormEvent,
    KeyboardEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

const CHAT_API = "https://api.planoassistencialintegrado.com.br/chatpai.php";
const STORAGE_KEY = "pai-chat-v1";
const MAX_HISTORY_TO_API = 20;

type Role = "user" | "assistant";

type ChatMessage = {
    id: string;
    role: Role;
    content: string;
    createdAt: string;
    toolsUsed?: string[];
};

type ChatApiResponse = {
    ok?: boolean;
    reply?: string;
    msg?: string;
    need_login?: 1;
    tools_used?: string[];
    model?: string;
    read_only?: boolean;
};

const QUICK_PROMPTS = [
    "Quantos atendimentos temos hoje?",
    "Quantas urnas saíram hoje?",
    "O que está abaixo do estoque mínimo?",
    "Quantas requisições estão pendentes?",
    "Quantas coroas estão em confecção?",
    "Qual é o balanço deste mês?",
];

const TOOL_LABELS: Record<string, string> = {
    consultar_atendimentos: "Atendimentos",
    consultar_estoque: "Estoque",
    consultar_movimentacoes: "Movimentações",
    consultar_requisicoes: "Requisições",
    consultar_coroas: "Coroas",
    consultar_balanco: "Balanço",
};

function makeId(prefix = "msg") {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
    return new Date().toISOString();
}

function loadStoredMessages(): ChatMessage[] {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter(
                (item) =>
                    item &&
                    (item.role === "user" || item.role === "assistant") &&
                    typeof item.content === "string",
            )
            .slice(-50)
            .map((item) => ({
                id: String(item.id || makeId()),
                role: item.role as Role,
                content: String(item.content),
                createdAt: String(item.createdAt || nowIso()),
                toolsUsed: Array.isArray(item.toolsUsed)
                    ? item.toolsUsed.map(String)
                    : undefined,
            }));
    } catch {
        return [];
    }
}

function saveStoredMessages(messages: ChatMessage[]) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(messages.slice(-50)),
        );
    } catch {
        // O chat continua funcionando mesmo se o navegador bloquear localStorage.
    }
}

function toolLabel(tool: string) {
    return TOOL_LABELS[tool] || tool.replace(/^consultar_/, "").replaceAll("_", " ");
}

function IconSparkles({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 3l1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" />
            <path d="M18.5 13.5l.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75.75-2.25Z" />
            <path d="M5.5 13l.75 2.25 2.25.75-2.25.75L5.5 19l-.75-2.25L2.5 16l2.25-.75L5.5 13Z" />
        </svg>
    );
}

function IconSend({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
    );
}

function IconPlus({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function IconShield({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

function IconTrash({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M4 7h16" />
            <path d="M10 11v6M14 11v6" />
            <path d="m9 7 1-3h4l1 3" />
            <path d="m6 7 1 14h10l1-14" />
        </svg>
    );
}

function AssistantAvatar() {
    return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm">
            <IconSparkles className="h-4.5 w-4.5" />
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex items-start gap-3">
            <AssistantAvatar />
            <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5" aria-label="Consultando dados">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.25s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.12s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                </div>
            </div>
        </div>
    );
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
    return (
        <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                <IconSparkles className="h-7 w-7" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                Chat PAI
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                Consulte atendimentos, estoque, movimentações, requisições, coroas e
                balanço usando perguntas em linguagem natural.
            </p>

            <div className="mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => onPrompt(prompt)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
                    >
                        {prompt}
                    </button>
                ))}
            </div>

            <div className="mt-6 flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <IconShield />
                Somente consultas. O chat não altera dados do sistema.
            </div>
        </div>
    );
}

export default function ChatPaiPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hydrated, setHydrated] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setMessages(loadStoredMessages());
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        saveStoredMessages(messages);
    }, [messages, hydrated]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, loading]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const canSend = useMemo(
        () => input.trim().length > 0 && !loading,
        [input, loading],
    );

    function clearChat() {
        if (loading) return;
        setMessages([]);
        setInput("");
        setError("");
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Sem impacto funcional.
        }
        requestAnimationFrame(() => textareaRef.current?.focus());
    }

    async function sendMessage(rawText?: string) {
        const text = String(rawText ?? input).trim();
        if (!text || loading) return;

        setError("");
        setInput("");

        const userMessage: ChatMessage = {
            id: makeId("user"),
            role: "user",
            content: text,
            createdAt: nowIso(),
        };

        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const payloadMessages = nextMessages
                .slice(-MAX_HISTORY_TO_API)
                .map(({ role, content }) => ({ role, content }));

            const response = await fetch(`${CHAT_API}?_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ messages: payloadMessages }),
            });

            const json = (await response.json().catch(() => null)) as ChatApiResponse | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }

            if (!response.ok || !json?.ok || !json.reply) {
                throw new Error(json?.msg || `Falha na consulta (HTTP ${response.status}).`);
            }

            const assistantMessage: ChatMessage = {
                id: makeId("assistant"),
                role: "assistant",
                content: json.reply,
                createdAt: nowIso(),
                toolsUsed: Array.isArray(json.tools_used) ? json.tools_used : [],
            };

            setMessages((current) => [...current, assistantMessage]);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Não foi possível consultar o Chat PAI.");
        } finally {
            setLoading(false);
            abortRef.current = null;
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        void sendMessage();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) void sendMessage();
        }
    }

    return (
        <div className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-950">
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                            <IconSparkles className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">
                                    Chat PAI
                                </h1>
                                <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:inline-flex">
                                    Somente leitura
                                </span>
                            </div>
                            <p className="truncate text-xs text-slate-500">
                                Assistente de consultas do sistema
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={clearChat}
                        disabled={loading || messages.length === 0}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Iniciar novo chat"
                    >
                        <IconPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Novo chat</span>
                    </button>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 sm:px-6">
                {!hydrated ? (
                    <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-400">
                        Carregando chat...
                    </div>
                ) : messages.length === 0 ? (
                    <EmptyState onPrompt={(prompt) => void sendMessage(prompt)} />
                ) : (
                    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 py-6 sm:py-8">
                        {messages.map((message) => {
                            const isUser = message.role === "user";

                            return (
                                <div
                                    key={message.id}
                                    className={isUser ? "flex justify-end" : "flex items-start gap-3"}
                                >
                                    {!isUser ? <AssistantAvatar /> : null}

                                    <div
                                        className={[
                                            "max-w-[88%] sm:max-w-[82%]",
                                            isUser ? "text-right" : "text-left",
                                        ].join(" ")}
                                    >
                                        <div
                                            className={[
                                                "whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 sm:text-[15px]",
                                                isUser
                                                    ? "rounded-2xl rounded-br-md bg-slate-950 text-white shadow-sm"
                                                    : "rounded-2xl rounded-tl-md border border-slate-200 bg-white text-slate-800 shadow-sm",
                                            ].join(" ")}
                                        >
                                            {message.content}
                                        </div>

                                        {!isUser && message.toolsUsed && message.toolsUsed.length > 0 ? (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {message.toolsUsed.map((tool) => (
                                                    <span
                                                        key={`${message.id}-${tool}`}
                                                        className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500"
                                                    >
                                                        {toolLabel(tool)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}

                        {loading ? <TypingIndicator /> : null}

                        {error ? (
                            <div className="ml-12 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div ref={bottomRef} />
                    </div>
                )}
            </main>

            <div className="sticky bottom-0 z-20 border-t border-slate-200/70 bg-slate-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
                <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-0 sm:py-4">
                    {messages.length > 0 && !loading ? (
                        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {QUICK_PROMPTS.slice(0, 4).map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => void sendMessage(prompt)}
                                    className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200/70"
                    >
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                rows={1}
                                maxLength={5000}
                                placeholder="Pergunte sobre atendimentos, estoque, coroas, balanço..."
                                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 sm:text-[15px]"
                            />

                            <button
                                type="submit"
                                disabled={!canSend}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                                aria-label="Enviar mensagem"
                            >
                                <IconSend className="h-4.5 w-4.5" />
                            </button>
                        </div>
                    </form>

                    <div className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400 sm:text-xs">
                        <IconShield className="h-3.5 w-3.5" />
                        O Chat PAI consulta dados, mas não altera registros.
                    </div>
                </div>
            </div>
        </div>
    );
}
