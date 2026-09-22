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
const STORAGE_KEY = "pai-chat-v3";
const VOICE_AUTO_KEY = "pai-chat-voice-auto-v1";
const MAX_HISTORY_TO_API = 20;
const MAX_RECORDING_SECONDS = 90;
const SPEECH_CHUNK_MAX = 3200;

type Role = "user" | "assistant";
type MessageSource = "text" | "audio";

type ChatMessage = {
    id: string;
    role: Role;
    content: string;
    createdAt: string;
    toolsUsed?: string[];
    source?: MessageSource;
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

type TranscriptionResponse = {
    ok?: boolean;
    text?: string;
    msg?: string;
    need_login?: 1;
    model?: string;
};

const QUICK_PROMPTS = [
    "Quantos atendimentos estão no quadro agora?",
    "Quem será sepultado hoje?",
    "Quantos AÇÚCAR temos?",
    "Quantas urnas saíram hoje?",
    "Quantas coroas estão em confecção agora?",
    "Qual é o balanço deste mês?",
];

const TOOL_LABELS: Record<string, string> = {
    consultar_atendimentos: "Atendimentos",
    detalhar_atendimento: "Atendimentos",
    consultar_estoque: "Estoque",
    consultar_produto_estoque: "Estoque",
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
                source: item.source === "audio" ? "audio" : "text",
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

function loadVoiceAutoPreference() {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(VOICE_AUTO_KEY) === "1";
    } catch {
        return false;
    }
}

function saveVoiceAutoPreference(value: boolean) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(VOICE_AUTO_KEY, value ? "1" : "0");
    } catch {
        // Sem impacto funcional.
    }
}

function toolLabel(tool: string) {
    return TOOL_LABELS[tool] || tool.replace(/^consultar_/, "").replaceAll("_", " ");
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

    return parts.map((part, index) => {
        const key = `${keyPrefix}-${index}`;

        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
                <strong key={key} className="font-semibold text-slate-950">
                    {part.slice(2, -2)}
                </strong>
            );
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return (
                <code
                    key={key}
                    className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-700"
                >
                    {part.slice(1, -1)}
                </code>
            );
        }

        return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

function AssistantContent({ content }: { content: string }) {
    const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");

    return (
        <div className="space-y-1.5">
            {lines.map((rawLine, index) => {
                const line = rawLine.trimEnd();
                const trimmed = line.trim();

                if (!trimmed) {
                    return <div key={`gap-${index}`} className="h-1" />;
                }

                const bullet = trimmed.match(/^[-•]\s+(.+)$/);
                if (bullet) {
                    return (
                        <div key={`bullet-${index}`} className="flex items-start gap-2 pl-0.5">
                            <span className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            <div className="min-w-0 flex-1">
                                {renderInlineMarkdown(bullet[1], `bullet-text-${index}`)}
                            </div>
                        </div>
                    );
                }

                const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
                if (numbered) {
                    return (
                        <div key={`number-${index}`} className="flex items-start gap-2">
                            <span className="min-w-5 shrink-0 font-medium text-slate-500">
                                {numbered[1]}.
                            </span>
                            <div className="min-w-0 flex-1">
                                {renderInlineMarkdown(numbered[2], `number-text-${index}`)}
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={`line-${index}`}>
                        {renderInlineMarkdown(line, `line-text-${index}`)}
                    </div>
                );
            })}
        </div>
    );
}

function stripMarkdownForSpeech(input: string) {
    return String(input || "")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\*\*|__|`|#/g, "")
        .replace(/^\s*[-*•]\s+/gm, "")
        .replace(/^\s*\d+[.)]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim();
}

function splitTextForSpeech(input: string, max = SPEECH_CHUNK_MAX) {
    const text = stripMarkdownForSpeech(input);
    if (!text) return [];
    if (text.length <= max) return [text];

    const chunks: string[] = [];
    let rest = text;

    while (rest.length > max) {
        const windowText = rest.slice(0, max + 1);
        let cut = Math.max(
            windowText.lastIndexOf(". "),
            windowText.lastIndexOf("? "),
            windowText.lastIndexOf("! "),
            windowText.lastIndexOf("; "),
            windowText.lastIndexOf(", "),
        );

        if (cut < Math.floor(max * 0.6)) {
            cut = windowText.lastIndexOf(" ");
        }
        if (cut < Math.floor(max * 0.4)) {
            cut = max;
        } else {
            cut += 1;
        }

        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }

    if (rest) chunks.push(rest);
    return chunks.filter(Boolean);
}

function getRecorderMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function extensionForMime(mime: string) {
    const lower = String(mime || "").toLowerCase();
    if (lower.includes("mp4")) return "m4a";
    if (lower.includes("ogg")) return "ogg";
    if (lower.includes("wav")) return "wav";
    if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
    return "webm";
}

function formatRecordingTime(seconds: number) {
    const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
    const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
}

function IconSparkles({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
            <path d="M12 3l1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" />
            <path d="M18.5 13.5l.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75.75-2.25Z" />
            <path d="M5.5 13l.75 2.25 2.25.75-2.25.75L5.5 19l-.75-2.25L2.5 16l2.25-.75L5.5 13Z" />
        </svg>
    );
}

function IconSend({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
    );
}

function IconPlus({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function IconShield({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

function IconMic({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </svg>
    );
}

function IconStop({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    );
}

function IconSpeaker({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" />
        </svg>
    );
}

function IconSpeakerOff({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="m3 3 18 18M11 5 6 9H3v6h3l5 4v-8M15.5 8.5a5 5 0 0 1 1.3 2.2M18 6a8 8 0 0 1 1.9 8.2" />
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

function TypingIndicator({ label = "Consultando dados" }: { label?: string }) {
    return (
        <div className="flex items-start gap-3">
            <AssistantAvatar />
            <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2" aria-label={label}>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.25s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.12s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                    </div>
                    <span className="text-xs text-slate-500">{label}</span>
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

            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Chat PAI</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                Digite ou toque no microfone. O Chat PAI consulta atendimentos, estoque,
                coroas, requisições e balanço, e também pode responder em voz.
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

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <IconShield />
                    Somente consultas. O chat não altera dados do sistema.
                </div>
                <div className="flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                    <IconSpeaker />
                    A voz das respostas é sintetizada por IA.
                </div>
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

    const [recording, setRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [transcribing, setTranscribing] = useState(false);
    const [voiceAuto, setVoiceAuto] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const messagesRef = useRef<ChatMessage[]>([]);
    const loadingRef = useRef(false);
    const voiceAutoRef = useRef(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingStartedAtRef = useRef(0);
    const recordingTimerRef = useRef<number | null>(null);
    const recordingAutoStopRef = useRef<number | null>(null);

    const speechAbortRef = useRef<AbortController | null>(null);
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const speechCacheRef = useRef<Map<string, string[]>>(new Map());

    useEffect(() => {
        const stored = loadStoredMessages();
        messagesRef.current = stored;
        setMessages(stored);

        const auto = loadVoiceAutoPreference();
        voiceAutoRef.current = auto;
        setVoiceAuto(auto);
        setHydrated(true);
    }, []);

    useEffect(() => {
        messagesRef.current = messages;
        if (!hydrated) return;
        saveStoredMessages(messages);
    }, [messages, hydrated]);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        voiceAutoRef.current = voiceAuto;
        if (hydrated) saveVoiceAutoPreference(voiceAuto);
    }, [voiceAuto, hydrated]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, loading, transcribing]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            speechAbortRef.current?.abort();
            currentAudioRef.current?.pause();

            if (recordingTimerRef.current !== null) {
                window.clearInterval(recordingTimerRef.current);
            }
            if (recordingAutoStopRef.current !== null) {
                window.clearTimeout(recordingAutoStopRef.current);
            }

            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recorder.onstop = null;
                    recorder.stop();
                } catch {
                    // Ignora erro de desmontagem.
                }
            }
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

            for (const urls of speechCacheRef.current.values()) {
                urls.forEach((url) => URL.revokeObjectURL(url));
            }
            speechCacheRef.current.clear();
        };
    }, []);

    const canSend = useMemo(
        () => input.trim().length > 0 && !loading && !recording && !transcribing,
        [input, loading, recording, transcribing],
    );

    const micDisabled = loading || transcribing;

    function stopCurrentSpeech() {
        speechAbortRef.current?.abort();
        speechAbortRef.current = null;

        const audio = currentAudioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            currentAudioRef.current = null;
        }
        setSpeakingMessageId(null);
    }

    function clearSpeechCache() {
        for (const urls of speechCacheRef.current.values()) {
            urls.forEach((url) => URL.revokeObjectURL(url));
        }
        speechCacheRef.current.clear();
    }

    function clearChat() {
        if (loading || recording || transcribing) return;
        stopCurrentSpeech();
        clearSpeechCache();
        messagesRef.current = [];
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

    async function fetchSpeechChunk(text: string, signal: AbortSignal) {
        const response = await fetch(`${CHAT_API}?action=speech&_=${Date.now()}`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                const json = (await response.json().catch(() => null)) as
                    | { msg?: string; need_login?: 1 }
                    | null;
                if (response.status === 401 || json?.need_login) {
                    throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
                }
                throw new Error(json?.msg || `Falha ao gerar voz (HTTP ${response.status}).`);
            }
            throw new Error(`Falha ao gerar voz (HTTP ${response.status}).`);
        }

        const blob = await response.blob();
        if (!blob.size) throw new Error("O servidor retornou um áudio vazio.");
        return URL.createObjectURL(blob);
    }

    async function playAudioUrl(url: string, signal: AbortSignal) {
        if (signal.aborted) throw new DOMException("Abortado", "AbortError");

        const audio = new Audio(url);
        currentAudioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                audio.onended = null;
                audio.onerror = null;
                signal.removeEventListener("abort", onAbort);
            };

            const onAbort = () => {
                audio.pause();
                cleanup();
                reject(new DOMException("Abortado", "AbortError"));
            };

            signal.addEventListener("abort", onAbort, { once: true });
            audio.onended = () => {
                cleanup();
                resolve();
            };
            audio.onerror = () => {
                cleanup();
                reject(new Error("Não foi possível reproduzir o áudio."));
            };

            audio.play().catch((err) => {
                cleanup();
                reject(err);
            });
        });
    }

    async function speakMessage(message: ChatMessage) {
        if (message.role !== "assistant") return;

        if (speakingMessageId === message.id) {
            stopCurrentSpeech();
            return;
        }

        stopCurrentSpeech();
        setError("");
        setSpeakingMessageId(message.id);

        const controller = new AbortController();
        speechAbortRef.current = controller;

        try {
            let urls = speechCacheRef.current.get(message.id);

            if (!urls) {
                const chunks = splitTextForSpeech(message.content);
                if (!chunks.length) return;

                urls = [];
                for (const chunk of chunks) {
                    if (controller.signal.aborted) throw new DOMException("Abortado", "AbortError");
                    urls.push(await fetchSpeechChunk(chunk, controller.signal));
                }
                speechCacheRef.current.set(message.id, urls);
            }

            for (const url of urls) {
                await playAudioUrl(url, controller.signal);
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            const messageText =
                err instanceof Error ? err.message : "Não foi possível reproduzir a resposta em voz.";
            if (/notallowed|play\(\) failed|user gesture/i.test(messageText)) {
                setError("O navegador bloqueou a reprodução automática. Toque no ícone de alto-falante da resposta.");
            } else {
                setError(messageText);
            }
        } finally {
            if (speechAbortRef.current === controller) speechAbortRef.current = null;
            currentAudioRef.current = null;
            setSpeakingMessageId((current) => (current === message.id ? null : current));
        }
    }

    async function sendMessage(
        rawText?: string,
        options?: { source?: MessageSource; forceVoice?: boolean },
    ) {
        const text = String(rawText ?? input).trim();
        if (!text || loadingRef.current || recording || transcribing) return;

        stopCurrentSpeech();
        setError("");
        setInput("");

        const userMessage: ChatMessage = {
            id: makeId("user"),
            role: "user",
            content: text,
            createdAt: nowIso(),
            source: options?.source || "text",
        };

        const nextMessages = [...messagesRef.current, userMessage];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        loadingRef.current = true;
        setLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const payloadMessages = nextMessages
                .slice(-MAX_HISTORY_TO_API)
                .map(({ role, content }) => ({ role, content }));

            const response = await fetch(`${CHAT_API}?action=chat&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/json" },
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
                source: "text",
            };

            const withAssistant = [...messagesRef.current, assistantMessage];
            messagesRef.current = withAssistant;
            setMessages(withAssistant);

            if (options?.forceVoice || voiceAutoRef.current) {
                void speakMessage(assistantMessage);
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Não foi possível consultar o Chat PAI.");
        } finally {
            loadingRef.current = false;
            setLoading(false);
            abortRef.current = null;
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
    }

    function clearRecordingTimers() {
        if (recordingTimerRef.current !== null) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (recordingAutoStopRef.current !== null) {
            window.clearTimeout(recordingAutoStopRef.current);
            recordingAutoStopRef.current = null;
        }
    }

    function releaseMicrophone() {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    }

    async function transcribeAudio(blob: Blob, mimeType: string) {
        setTranscribing(true);
        setError("");

        try {
            const ext = extensionForMime(mimeType || blob.type);
            const file = new File([blob], `pergunta.${ext}`, {
                type: mimeType || blob.type || "audio/webm",
            });
            const form = new FormData();
            form.append("audio", file);

            const response = await fetch(`${CHAT_API}?action=transcribe&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                body: form,
            });

            const json = (await response.json().catch(() => null)) as TranscriptionResponse | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }
            if (!response.ok || !json?.ok || !json.text?.trim()) {
                throw new Error(json?.msg || `Falha ao transcrever o áudio (HTTP ${response.status}).`);
            }

            const transcript = json.text.trim();
            setTranscribing(false);
            await sendMessage(transcript, { source: "audio", forceVoice: true });
        } catch (err: unknown) {
            setTranscribing(false);
            setError(err instanceof Error ? err.message : "Não foi possível transcrever o áudio.");
        }
    }

    async function startRecording() {
        if (micDisabled || recording) return;
        stopCurrentSpeech();
        setError("");

        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices?.getUserMedia ||
            typeof MediaRecorder === "undefined"
        ) {
            setError("Este navegador não oferece suporte à gravação de áudio necessária para o Chat PAI.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const mimeType = getRecorderMimeType();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                clearRecordingTimers();
                releaseMicrophone();
                setRecording(false);
                setError("O navegador encontrou um erro durante a gravação do áudio.");
            };

            recorder.onstop = () => {
                clearRecordingTimers();
                setRecording(false);
                releaseMicrophone();

                const finalMime = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(audioChunksRef.current, { type: finalMime });
                audioChunksRef.current = [];
                mediaRecorderRef.current = null;

                if (blob.size < 300) {
                    setError("O áudio ficou muito curto. Grave a pergunta novamente.");
                    return;
                }

                void transcribeAudio(blob, finalMime);
            };

            recordingStartedAtRef.current = Date.now();
            setRecordingSeconds(0);
            setRecording(true);
            recorder.start(250);

            recordingTimerRef.current = window.setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
                setRecordingSeconds(Math.min(MAX_RECORDING_SECONDS, elapsed));
            }, 250);

            recordingAutoStopRef.current = window.setTimeout(() => {
                const active = mediaRecorderRef.current;
                if (active && active.state !== "inactive") {
                    active.stop();
                }
            }, MAX_RECORDING_SECONDS * 1000);
        } catch (err: unknown) {
            releaseMicrophone();
            setRecording(false);
            const name = err instanceof DOMException ? err.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                setError("Permita o acesso ao microfone no navegador para fazer perguntas por áudio.");
            } else {
                setError(err instanceof Error ? err.message : "Não foi possível acessar o microfone.");
            }
        }
    }

    function stopRecording() {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        recorder.stop();
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
                <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                            <IconSparkles className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">Chat PAI</h1>
                                <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:inline-flex">
                                    Somente leitura
                                </span>
                            </div>
                            <p className="truncate text-xs text-slate-500">Assistente operacional com texto e voz</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                const next = !voiceAuto;
                                setVoiceAuto(next);
                                if (!next) stopCurrentSpeech();
                            }}
                            className={[
                                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
                                voiceAuto
                                    ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            ].join(" ")}
                            title={voiceAuto ? "Desativar respostas automáticas em voz" : "Ativar respostas automáticas em voz"}
                        >
                            {voiceAuto ? <IconSpeaker /> : <IconSpeakerOff />}
                            <span className="hidden sm:inline">Voz {voiceAuto ? "ligada" : "desligada"}</span>
                        </button>

                        <button
                            type="button"
                            onClick={clearChat}
                            disabled={loading || recording || transcribing || messages.length === 0}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Iniciar novo chat"
                        >
                            <IconPlus className="h-4 w-4" />
                            <span className="hidden sm:inline">Novo chat</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 sm:px-6">
                {!hydrated ? (
                    <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-400">Carregando chat...</div>
                ) : messages.length === 0 ? (
                    <EmptyState onPrompt={(prompt) => void sendMessage(prompt)} />
                ) : (
                    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 py-6 sm:py-8">
                        {messages.map((message) => {
                            const isUser = message.role === "user";
                            const speaking = speakingMessageId === message.id;

                            return (
                                <div key={message.id} className={isUser ? "flex justify-end" : "flex items-start gap-3"}>
                                    {!isUser ? <AssistantAvatar /> : null}

                                    <div className={["max-w-[88%] sm:max-w-[82%]", isUser ? "text-right" : "text-left"].join(" ")}>
                                        <div
                                            className={[
                                                "break-words px-4 py-3 text-sm leading-6 sm:text-[15px]",
                                                isUser
                                                    ? "rounded-2xl rounded-br-md bg-slate-950 text-white shadow-sm"
                                                    : "rounded-2xl rounded-tl-md border border-slate-200 bg-white text-slate-800 shadow-sm",
                                            ].join(" ")}
                                        >
                                            {isUser ? (
                                                <div className="whitespace-pre-wrap">{message.content}</div>
                                            ) : (
                                                <AssistantContent content={message.content} />
                                            )}
                                        </div>

                                        <div className={["mt-2 flex flex-wrap items-center gap-1.5", isUser ? "justify-end" : "justify-start"].join(" ")}>
                                            {isUser && message.source === "audio" ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-600">
                                                    <IconMic className="h-3 w-3" />
                                                    Transcrito do áudio
                                                </span>
                                            ) : null}

                                            {!isUser ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void speakMessage(message)}
                                                    className={[
                                                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition",
                                                        speaking
                                                            ? "bg-sky-100 text-sky-700"
                                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                                                    ].join(" ")}
                                                    title={speaking ? "Parar áudio" : "Ouvir resposta"}
                                                >
                                                    {speaking ? <IconStop className="h-3 w-3" /> : <IconSpeaker className="h-3 w-3" />}
                                                    {speaking ? "Parar" : "Ouvir"}
                                                </button>
                                            ) : null}

                                            {!isUser && message.toolsUsed && message.toolsUsed.length > 0
                                                ? message.toolsUsed.map((tool) => (
                                                    <span
                                                        key={`${message.id}-${tool}`}
                                                        className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500"
                                                    >
                                                        {toolLabel(tool)}
                                                    </span>
                                                ))
                                                : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {transcribing ? <TypingIndicator label="Transcrevendo sua pergunta" /> : null}
                        {loading ? <TypingIndicator label="Consultando dados" /> : null}

                        {error ? (
                            <div className="ml-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 sm:ml-12">
                                {error}
                            </div>
                        ) : null}

                        <div ref={bottomRef} />
                    </div>
                )}
            </main>

            <div className="sticky bottom-0 z-20 border-t border-slate-200/70 bg-slate-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
                <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-0 sm:py-4">
                    {messages.length > 0 && !loading && !recording && !transcribing ? (
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

                    {recording ? (
                        <div className="mb-2 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <div className="flex items-center gap-2 font-semibold">
                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                                Gravando {formatRecordingTime(recordingSeconds)}
                            </div>
                            <span>Toque no botão vermelho para enviar</span>
                        </div>
                    ) : null}

                    {transcribing ? (
                        <div className="mb-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
                            Transcrevendo o áudio antes de consultar o sistema...
                        </div>
                    ) : null}

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200/70"
                    >
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={() => (recording ? stopRecording() : void startRecording())}
                                disabled={micDisabled}
                                className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                                    recording
                                        ? "bg-red-600 text-white hover:bg-red-700"
                                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                                ].join(" ")}
                                aria-label={recording ? "Parar gravação e enviar" : "Perguntar por áudio"}
                                title={recording ? "Parar gravação e enviar" : "Perguntar por áudio"}
                            >
                                {recording ? <IconStop className="h-4 w-4" /> : <IconMic className="h-5 w-5" />}
                            </button>

                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading || recording || transcribing}
                                rows={1}
                                maxLength={5000}
                                placeholder={
                                    recording
                                        ? "Ouvindo sua pergunta..."
                                        : transcribing
                                            ? "Transcrevendo áudio..."
                                            : "Pergunte por texto ou toque no microfone..."
                                }
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

                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[10px] text-slate-400 sm:text-xs">
                        <span className="inline-flex items-center gap-1.5">
                            <IconShield className="h-3.5 w-3.5" />
                            O Chat PAI consulta dados, mas não altera registros.
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <IconSpeaker className="h-3.5 w-3.5" />
                            A voz reproduzida é gerada por IA.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
