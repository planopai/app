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
const STORAGE_KEY = "pai-aurora-v1-performance";
const VOICE_AUTO_KEY = "pai-aurora-voice-auto-v1";
const MAX_HISTORY_TO_API = 8;
const SPEECH_CHUNK_MAX = 3800;
const PCM_SAMPLE_RATE = 24000;
const PCM_MIN_SCHEDULE_BYTES = 9600;

type Role = "user" | "assistant";
type MessageSource = "text" | "audio";
type RealtimeState = "off" | "connecting" | "listening" | "speaking" | "consulting";

type ProductPhoto = {
    id?: number | null;
    produto_id?: number;
    arquivo?: string | null;
    foto_url?: string | null;
    legenda?: string | null;
    ordem?: number;
    is_principal?: number;
};

type ProductDeposit = {
    deposito_id?: number;
    deposito?: string;
    quantidade?: number;
    minimo?: number;
    maximo?: number;
};

type ProductCard = {
    produto_id: number;
    produto_nome: string;
    descricao?: string | null;
    codigo_barras?: string | null;
    valor?: number | null;
    valor_formatado?: string | null;
    preco_custo?: number | null;
    preco_custo_formatado?: string | null;
    categoria?: string | null;
    classificacao?: string | null;
    fabricante?: string | null;
    quantidade_total?: number;
    foto_url?: string | null;
    fotos?: ProductPhoto[];
    depositos?: ProductDeposit[];
};

type ProductSuggestion = {
    produto_id: number;
    produto_nome: string;
    categoria?: string | null;
    fabricante?: string | null;
    similaridade?: number | null;
};


type ChatMessage = {
    id: string;
    role: Role;
    content: string;
    createdAt: string;
    toolsUsed?: string[];
    source?: MessageSource;
    streaming?: boolean;
    productCards?: ProductCard[];
    productSuggestions?: ProductSuggestion[];
};

type SseEvent = {
    event: string;
    data: any;
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

const PRODUCT_IMG_BASE = "https://api.planoassistencialintegrado.com.br/uploads/produtos/";

function normalizeProductImageUrl(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "null" || raw === "undefined") return null;
    if (/^data:image\//i.test(raw) || /^blob:/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
    const clean = raw.replace(/^\/+/, "");
    if (clean.startsWith("uploads/")) return `https://api.planoassistencialintegrado.com.br/${clean}`;
    if (clean.startsWith("uploads/produtos/")) return `https://api.planoassistencialintegrado.com.br/${clean}`;
    if (clean.startsWith("produtos/")) return `${PRODUCT_IMG_BASE}${clean.slice("produtos/".length)}`;
    return `${PRODUCT_IMG_BASE}${clean}`;
}

function sanitizeProductCards(value: unknown): ProductCard[] {
    if (!Array.isArray(value)) return [];
    const out: ProductCard[] = [];
    const seen = new Set<number>();
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const id = Number(item.produto_id || 0);
        const name = String(item.produto_nome || "").trim();
        if (!Number.isFinite(id) || id <= 0 || !name || seen.has(id)) continue;
        seen.add(id);
        const fotos: ProductPhoto[] = Array.isArray(item.fotos)
            ? item.fotos
                .map((foto: any) => ({
                    id: foto?.id == null ? null : Number(foto.id),
                    produto_id: id,
                    arquivo: foto?.arquivo == null ? null : String(foto.arquivo),
                    foto_url: normalizeProductImageUrl(foto?.foto_url || foto?.arquivo || null),
                    legenda: foto?.legenda == null ? null : String(foto.legenda),
                    ordem: Number(foto?.ordem || 0),
                    is_principal: Number(foto?.is_principal || 0),
                }))
                .filter((foto: ProductPhoto) => Boolean(foto.foto_url))
            : [];
        const fallback = normalizeProductImageUrl(item.foto_url || null);
        if (fallback && !fotos.some((foto) => foto.foto_url === fallback)) {
            fotos.unshift({ produto_id: id, foto_url: fallback, ordem: 0, is_principal: 1 });
        }
        fotos.sort((a, b) => {
            const pa = Number(a.is_principal || 0) === 1 ? 0 : 1;
            const pb = Number(b.is_principal || 0) === 1 ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return Number(a.ordem || 0) - Number(b.ordem || 0);
        });
        out.push({
            produto_id: id,
            produto_nome: name,
            descricao: item.descricao == null ? null : String(item.descricao),
            codigo_barras: item.codigo_barras == null ? null : String(item.codigo_barras),
            valor: item.valor == null || !Number.isFinite(Number(item.valor)) ? null : Number(item.valor),
            valor_formatado: item.valor_formatado == null ? null : String(item.valor_formatado),
            preco_custo: item.preco_custo == null || !Number.isFinite(Number(item.preco_custo)) ? null : Number(item.preco_custo),
            preco_custo_formatado: item.preco_custo_formatado == null ? null : String(item.preco_custo_formatado),
            categoria: item.categoria == null ? null : String(item.categoria),
            classificacao: item.classificacao == null ? null : String(item.classificacao),
            fabricante: item.fabricante == null ? null : String(item.fabricante),
            quantidade_total: Number.isFinite(Number(item.quantidade_total)) ? Number(item.quantidade_total) : 0,
            foto_url: fotos[0]?.foto_url || fallback,
            fotos,
            depositos: Array.isArray(item.depositos) ? item.depositos : [],
        });
    }
    return out;
}


function sanitizeProductSuggestions(value: unknown): ProductSuggestion[] {
    if (!Array.isArray(value)) return [];
    const out: ProductSuggestion[] = [];
    const seen = new Set<number>();
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const id = Number(item.produto_id ?? item.id ?? 0);
        const name = String(item.produto_nome ?? item.nome ?? "").trim();
        if (!Number.isFinite(id) || id <= 0 || !name || seen.has(id)) continue;
        seen.add(id);
        const similarity = item.similaridade == null ? null : Number(item.similaridade);
        out.push({
            produto_id: id,
            produto_nome: name,
            categoria: item.categoria == null ? null : String(item.categoria),
            fabricante: item.fabricante == null ? null : String(item.fabricante),
            similaridade: similarity != null && Number.isFinite(similarity) ? similarity : null,
        });
    }
    return out.slice(0, 6);
}

function moneyBRL(value?: number | null, formatted?: string | null) {
    if (formatted?.trim()) return formatted.trim();
    if (value == null || !Number.isFinite(Number(value))) return null;
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
    } catch {
        return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
    }
}

function ProductCardView({ product }: { product: ProductCard }) {
    const photos = useMemo(() => {
        const list = Array.isArray(product.fotos) ? product.fotos.filter((f) => Boolean(f.foto_url)) : [];
        if (!list.length && product.foto_url) return [{ produto_id: product.produto_id, foto_url: product.foto_url, is_principal: 1 } as ProductPhoto];
        return list;
    }, [product]);
    const [active, setActive] = useState(0);
    useEffect(() => setActive(0), [product.produto_id]);
    const current = photos[Math.min(active, Math.max(0, photos.length - 1))];
    const price = moneyBRL(product.valor, product.valor_formatado);
    const stock = Number(product.quantidade_total || 0);

    return (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
            {current?.foto_url ? (
                <a href={current.foto_url} target="_blank" rel="noreferrer" className="block bg-white">
                    <img
                        src={current.foto_url}
                        alt={current.legenda || product.produto_nome}
                        className="max-h-[360px] w-full object-contain p-2"
                        loading="lazy"
                    />
                </a>
            ) : null}

            {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2">
                    {photos.slice(0, 8).map((photo, index) => (
                        <button
                            key={`${product.produto_id}-photo-${photo.id ?? index}`}
                            type="button"
                            onClick={() => setActive(index)}
                            className={[
                                "h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white",
                                index === active ? "border-sky-500 ring-2 ring-sky-100" : "border-slate-200",
                            ].join(" ")}
                            title={photo.legenda || `Foto ${index + 1}`}
                        >
                            <img src={photo.foto_url || ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="space-y-2 p-3 text-left">
                <div className="font-semibold text-slate-950">{product.produto_nome}</div>
                {price ? <div className="text-base font-semibold text-emerald-700">{price}</div> : null}
                <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                    {product.fabricante ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{product.fabricante}</span> : null}
                    {product.categoria ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{product.categoria}</span> : null}
                    {product.classificacao ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{product.classificacao}</span> : null}
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">Estoque: {stock.toLocaleString("pt-BR")}</span>
                </div>
                {product.descricao ? <p className="text-xs leading-5 text-slate-600">{product.descricao}</p> : null}
                {product.codigo_barras ? <div className="text-[11px] text-slate-500">Código: {product.codigo_barras}</div> : null}
            </div>
        </div>
    );
}

function ProductCards({ products }: { products?: ProductCard[] }) {
    if (!products?.length) return null;
    return (
        <div className="mt-3 space-y-3">
            {products.map((product) => <ProductCardView key={product.produto_id} product={product} />)}
        </div>
    );
}


function ProductSuggestions({
    suggestions,
    onChoose,
    disabled = false,
}: {
    suggestions?: ProductSuggestion[];
    onChoose: (name: string) => void;
    disabled?: boolean;
}) {
    if (!suggestions?.length) return null;
    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sugestões próximas</div>
            <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 6).map((item) => (
                    <button
                        key={`product-suggestion-${item.produto_id}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChoose(item.produto_nome)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={[item.categoria, item.fabricante].filter(Boolean).join(" • ")}
                    >
                        <span className="block font-semibold text-slate-900">{item.produto_nome}</span>
                        {(item.categoria || item.fabricante) ? (
                            <span className="mt-0.5 block text-[10px] text-slate-500">
                                {[item.categoria, item.fabricante].filter(Boolean).join(" • ")}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
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
            .slice(-40)
            .map((item) => ({
                id: String(item.id || makeId()),
                role: item.role as Role,
                content: String(item.content),
                createdAt: String(item.createdAt || nowIso()),
                toolsUsed: Array.isArray(item.toolsUsed) ? item.toolsUsed.map(String) : undefined,
                productCards: sanitizeProductCards(item.productCards),
                productSuggestions: sanitizeProductSuggestions(item.productSuggestions),
                source: item.source === "audio" ? "audio" : "text",
                streaming: false,
            }));
    } catch {
        return [];
    }
}

function saveStoredMessages(messages: ChatMessage[]) {
    if (typeof window === "undefined") return;
    try {
        const clean = messages
            .filter((m) => m.content.trim())
            .slice(-40)
            .map(({ streaming: _streaming, ...rest }) => rest);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
        // localStorage é opcional.
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
                <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-700">
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
                if (!trimmed) return <div key={`gap-${index}`} className="h-1" />;

                const bullet = trimmed.match(/^[-•]\s+(.+)$/);
                if (bullet) {
                    return (
                        <div key={`bullet-${index}`} className="flex items-start gap-2 pl-0.5">
                            <span className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            <div className="min-w-0 flex-1">{renderInlineMarkdown(bullet[1], `bullet-${index}`)}</div>
                        </div>
                    );
                }

                const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
                if (numbered) {
                    return (
                        <div key={`number-${index}`} className="flex items-start gap-2">
                            <span className="min-w-5 shrink-0 font-medium text-slate-500">{numbered[1]}.</span>
                            <div className="min-w-0 flex-1">{renderInlineMarkdown(numbered[2], `number-${index}`)}</div>
                        </div>
                    );
                }

                return <div key={`line-${index}`}>{renderInlineMarkdown(line, `line-${index}`)}</div>;
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
        const sample = rest.slice(0, max + 1);
        let cut = Math.max(
            sample.lastIndexOf(". "),
            sample.lastIndexOf("? "),
            sample.lastIndexOf("! "),
            sample.lastIndexOf("; "),
        );
        if (cut < Math.floor(max * 0.55)) cut = sample.lastIndexOf(" ");
        if (cut < Math.floor(max * 0.35)) cut = max;
        else cut += 1;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks.filter(Boolean);
}

function concatBytes(a: Uint8Array, b: Uint8Array) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

async function consumeSse(response: Response, onEvent: (event: SseEvent) => void) {
    if (!response.body) throw new Error("O navegador não recebeu o streaming da resposta.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const processBlock = (block: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) return;
        const raw = dataLines.join("\n");
        let data: any = raw;
        try {
            data = JSON.parse(raw);
        } catch {
            // Mantém texto bruto.
        }
        onEvent({ event: eventName, data });
    };

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let idx = buffer.indexOf("\n\n");
            while (idx >= 0) {
                const block = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                if (block.trim()) processBlock(block);
                idx = buffer.indexOf("\n\n");
            }
        }
        if (done) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) processBlock(buffer.trim());
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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Aurora</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                Assistente Administrativo do PAI. Texto em streaming, voz em tempo real e IA adaptativa para cada tipo de consulta, sempre em modo somente leitura.
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
                    <IconShield /> Somente consultas
                </div>
                <div className="flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                    <IconMic /> Voz em tempo real
                </div>
            </div>
        </div>
    );
}

export default function AuroraPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hydrated, setHydrated] = useState(false);
    const [voiceAuto, setVoiceAuto] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const [realtimeState, setRealtimeState] = useState<RealtimeState>("off");

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const loadingRef = useRef(false);
    const voiceAutoRef = useRef(false);

    const speechAbortRef = useRef<AbortController | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const speechSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const realtimePcRef = useRef<RTCPeerConnection | null>(null);
    const realtimeDcRef = useRef<RTCDataChannel | null>(null);
    const realtimeMicRef = useRef<MediaStream | null>(null);
    const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
    const realtimeInputSeenRef = useRef<Set<string>>(new Set());
    const realtimeAssistantIdsRef = useRef<Map<string, string>>(new Map());
    const realtimeToolsRef = useRef<Set<string>>(new Set());
    const realtimeProductCardsRef = useRef<ProductCard[]>([]);
    const realtimeProductSuggestionsRef = useRef<ProductSuggestion[]>([]);
    const realtimeClosingRef = useRef(false);

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
        if (hydrated) saveStoredMessages(messages);
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
    }, [messages, loading, realtimeState]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            stopCurrentSpeech();
            stopRealtimeVoice(false);
            void audioContextRef.current?.close().catch(() => undefined);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canSend = useMemo(
        () => input.trim().length > 0 && !loading && realtimeState === "off",
        [input, loading, realtimeState],
    );

    function commitMessages(next: ChatMessage[]) {
        messagesRef.current = next;
        setMessages(next);
    }

    function updateMessage(id: string, updater: (message: ChatMessage) => ChatMessage) {
        const next = messagesRef.current.map((message) => (message.id === id ? updater(message) : message));
        commitMessages(next);
    }

    function appendMessage(message: ChatMessage) {
        commitMessages([...messagesRef.current, message]);
    }

    function stopCurrentSpeech() {
        speechAbortRef.current?.abort();
        speechAbortRef.current = null;
        for (const source of speechSourcesRef.current) {
            try {
                source.stop();
            } catch {
                // Já finalizado.
            }
        }
        speechSourcesRef.current.clear();
        setSpeakingMessageId(null);
    }

    function getAudioContext() {
        if (!audioContextRef.current) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) throw new Error("Este navegador não suporta reprodução de áudio em streaming.");
            audioContextRef.current = new AudioCtx();
        }
        return audioContextRef.current;
    }

    async function playPcmChunkedText(text: string, signal: AbortSignal) {
        const response = await fetch(`${CHAT_API}?action=speech-stream&_=${Date.now()}`, {
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
                const json = (await response.json().catch(() => null)) as { msg?: string; need_login?: 1 } | null;
                if (response.status === 401 || json?.need_login) throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
                throw new Error(json?.msg || `Falha ao gerar voz (HTTP ${response.status}).`);
            }
            throw new Error(`Falha ao gerar voz (HTTP ${response.status}).`);
        }
        if (!response.body) throw new Error("O navegador não recebeu o áudio em streaming.");

        const ctx = getAudioContext();
        await ctx.resume();
        const reader = response.body.getReader();
        let pending = new Uint8Array(0);
        let nextStart = Math.max(ctx.currentTime + 0.05, ctx.currentTime);
        let lastSource: AudioBufferSourceNode | null = null;

        const schedule = (bytes: Uint8Array) => {
            const usable = bytes.length - (bytes.length % 2);
            if (usable <= 0) return;
            const dataView = new DataView(bytes.buffer, bytes.byteOffset, usable);
            const floats = new Float32Array(usable / 2);
            for (let i = 0; i < floats.length; i++) {
                floats[i] = dataView.getInt16(i * 2, true) / 32768;
            }
            const audioBuffer = ctx.createBuffer(1, floats.length, PCM_SAMPLE_RATE);
            audioBuffer.copyToChannel(floats, 0);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            speechSourcesRef.current.add(source);
            source.addEventListener("ended", () => speechSourcesRef.current.delete(source), { once: true });
            const startAt = Math.max(nextStart, ctx.currentTime + 0.025);
            source.start(startAt);
            nextStart = startAt + audioBuffer.duration;
            lastSource = source;
        };

        while (true) {
            if (signal.aborted) throw new DOMException("Abortado", "AbortError");
            const { value, done } = await reader.read();
            if (value?.length) pending = concatBytes(pending, value);

            while (pending.length >= PCM_MIN_SCHEDULE_BYTES) {
                const evenSize = PCM_MIN_SCHEDULE_BYTES - (PCM_MIN_SCHEDULE_BYTES % 2);
                schedule(pending.slice(0, evenSize));
                pending = pending.slice(evenSize);
            }
            if (done) break;
        }
        if (pending.length) schedule(pending);

        if (lastSource) {
            await new Promise<void>((resolve, reject) => {
                const source = lastSource as AudioBufferSourceNode;
                const onAbort = () => {
                    try {
                        source.stop();
                    } catch {
                        // Ignora.
                    }
                    reject(new DOMException("Abortado", "AbortError"));
                };
                signal.addEventListener("abort", onAbort, { once: true });
                source.addEventListener(
                    "ended",
                    () => {
                        signal.removeEventListener("abort", onAbort);
                        resolve();
                    },
                    { once: true },
                );
            });
        }
    }

    async function speakMessage(message: ChatMessage) {
        if (message.role !== "assistant" || !message.content.trim()) return;
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
            const chunks = splitTextForSpeech(message.content);
            for (const chunk of chunks) {
                await playPcmChunkedText(chunk, controller.signal);
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Não foi possível reproduzir a resposta em voz.");
        } finally {
            if (speechAbortRef.current === controller) speechAbortRef.current = null;
            setSpeakingMessageId((current) => (current === message.id ? null : current));
        }
    }

    async function sendMessage(rawText?: string) {
        const text = String(rawText ?? input).trim();
        if (!text || loadingRef.current || realtimeState !== "off") return;

        stopCurrentSpeech();
        setError("");
        setInput("");

        const userMessage: ChatMessage = {
            id: makeId("user"),
            role: "user",
            content: text,
            createdAt: nowIso(),
            source: "text",
        };
        const assistantId = makeId("assistant");
        const assistantPlaceholder: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: nowIso(),
            toolsUsed: [],
            source: "text",
            streaming: true,
        };

        const next = [...messagesRef.current, userMessage, assistantPlaceholder];
        commitMessages(next);
        loadingRef.current = true;
        setLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;
        let finalText = "";
        let finalTools: string[] = [];
        let finalProductCards: ProductCard[] = [];
        let finalProductSuggestions: ProductSuggestion[] = [];
        let streamError = "";

        try {
            const payloadMessages = [...messagesRef.current]
                .filter((m) => m.id !== assistantId && m.content.trim())
                .slice(-MAX_HISTORY_TO_API)
                .map(({ role, content }) => ({ role, content }));

            const response = await fetch(`${CHAT_API}?action=chat-stream&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({ messages: payloadMessages }),
            });

            if (!response.ok) {
                const json = (await response.json().catch(() => null)) as { msg?: string; need_login?: 1 } | null;
                if (response.status === 401 || json?.need_login) throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
                throw new Error(json?.msg || `Falha na consulta (HTTP ${response.status}).`);
            }

            await consumeSse(response, ({ event, data }) => {
                if (event === "delta") {
                    const delta = String(data?.text || "");
                    if (!delta) return;
                    finalText += delta;
                    updateMessage(assistantId, (m) => ({ ...m, content: finalText }));
                } else if (event === "meta") {
                    if (Array.isArray(data?.tools_used)) finalTools = data.tools_used.map(String);
                    if (Array.isArray(data?.product_cards)) finalProductCards = sanitizeProductCards(data.product_cards);
                    if (Array.isArray(data?.product_suggestions)) finalProductSuggestions = sanitizeProductSuggestions(data.product_suggestions);
                    updateMessage(assistantId, (m) => ({ ...m, toolsUsed: finalTools, productCards: finalProductCards, productSuggestions: finalProductSuggestions }));
                } else if (event === "done") {
                    if (Array.isArray(data?.tools_used)) finalTools = data.tools_used.map(String);
                    if (Array.isArray(data?.product_cards)) finalProductCards = sanitizeProductCards(data.product_cards);
                    if (Array.isArray(data?.product_suggestions)) finalProductSuggestions = sanitizeProductSuggestions(data.product_suggestions);
                } else if (event === "error") {
                    streamError = String(data?.msg || "Falha na resposta em streaming.");
                    throw new Error(streamError);
                }
            });

            if (!finalText.trim()) throw new Error(streamError || "A Aurora não retornou uma resposta.");
            const finalMessage: ChatMessage = {
                id: assistantId,
                role: "assistant",
                content: finalText,
                createdAt: assistantPlaceholder.createdAt,
                toolsUsed: finalTools,
                productCards: finalProductCards,
                productSuggestions: finalProductSuggestions,
                source: "text",
                streaming: false,
            };
            updateMessage(assistantId, () => finalMessage);

            if (voiceAutoRef.current) void speakMessage(finalMessage);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            const message = err instanceof Error ? err.message : "Não foi possível consultar a Aurora.";
            setError(message);
            if (!finalText.trim()) {
                commitMessages(messagesRef.current.filter((m) => m.id !== assistantId));
            } else {
                updateMessage(assistantId, (m) => ({ ...m, streaming: false }));
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
            abortRef.current = null;
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
    }

    async function callRealtimeTool(name: string, args: any) {
        const response = await fetch(`${CHAT_API}?action=tool&_=${Date.now()}`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, args }),
        });
        const json = await response.json().catch(() => null);
        if (response.status === 401 || json?.need_login) throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
        if (!response.ok || !json?.ok) throw new Error(json?.msg || `Falha na consulta ${name}.`);
        return {
            result: json.result,
            productCards: sanitizeProductCards(json?.product_cards),
            productSuggestions: sanitizeProductSuggestions(json?.product_suggestions),
        };
    }

    async function handleRealtimeEvent(event: any) {
        const type = String(event?.type || "");

        if (type === "input_audio_buffer.speech_started") {
            realtimeToolsRef.current.clear();
            realtimeProductCardsRef.current = [];
            realtimeProductSuggestionsRef.current = [];
            setRealtimeState("listening");
            return;
        }
        if (type === "response.output_audio.delta") {
            setRealtimeState("speaking");
            return;
        }
        if (type === "response.output_audio.done") {
            setRealtimeState("listening");
            return;
        }
        if (type === "conversation.item.input_audio_transcription.completed") {
            const itemId = String(event?.item_id || makeId("voice-input"));
            const transcript = String(event?.transcript || "").trim();
            if (!transcript || realtimeInputSeenRef.current.has(itemId)) return;
            realtimeInputSeenRef.current.add(itemId);
            appendMessage({
                id: `user-${itemId}`,
                role: "user",
                content: transcript,
                createdAt: nowIso(),
                source: "audio",
            });
            return;
        }
        if (type === "response.output_audio_transcript.delta") {
            const key = String(event?.item_id || event?.response_id || "voice-response");
            const delta = String(event?.delta || "");
            if (!delta) return;
            let messageId = realtimeAssistantIdsRef.current.get(key);
            if (!messageId) {
                messageId = makeId("assistant-voice");
                realtimeAssistantIdsRef.current.set(key, messageId);
                appendMessage({
                    id: messageId,
                    role: "assistant",
                    content: "",
                    createdAt: nowIso(),
                    toolsUsed: Array.from(realtimeToolsRef.current),
                    productCards: realtimeProductCardsRef.current,
                    productSuggestions: realtimeProductSuggestionsRef.current,
                    source: "audio",
                    streaming: true,
                });
            }
            updateMessage(messageId, (m) => ({
                ...m,
                content: m.content + delta,
                toolsUsed: Array.from(realtimeToolsRef.current),
                productCards: realtimeProductCardsRef.current,
                productSuggestions: realtimeProductSuggestionsRef.current,
            }));
            return;
        }
        if (type === "response.output_audio_transcript.done") {
            const key = String(event?.item_id || event?.response_id || "voice-response");
            const messageId = realtimeAssistantIdsRef.current.get(key);
            if (!messageId) return;
            const transcript = String(event?.transcript || "").trim();
            updateMessage(messageId, (m) => ({
                ...m,
                content: transcript || m.content,
                toolsUsed: Array.from(realtimeToolsRef.current),
                productCards: realtimeProductCardsRef.current,
                productSuggestions: realtimeProductSuggestionsRef.current,
                streaming: false,
            }));
            return;
        }
        if (type === "response.done") {
            const output = Array.isArray(event?.response?.output) ? event.response.output : [];
            const calls = output.filter((item: any) => item?.type === "function_call");
            if (calls.length > 0) {
                setRealtimeState("consulting");
                const results = await Promise.all(
                    calls.map(async (call: any) => {
                        const name = String(call?.name || "");
                        const callId = String(call?.call_id || "");
                        let args: any = {};
                        try {
                            args = JSON.parse(String(call?.arguments || "{}"));
                        } catch {
                            args = {};
                        }
                        realtimeToolsRef.current.add(name);
                        const toolResponse = await callRealtimeTool(name, args);
                        if (toolResponse.productCards.length) {
                            const merged = sanitizeProductCards([...realtimeProductCardsRef.current, ...toolResponse.productCards]);
                            realtimeProductCardsRef.current = merged;
                        }
                        if (toolResponse.productSuggestions.length) {
                            const mergedSuggestions = sanitizeProductSuggestions([...realtimeProductSuggestionsRef.current, ...toolResponse.productSuggestions]);
                            realtimeProductSuggestionsRef.current = mergedSuggestions;
                        }
                        return { callId, result: toolResponse.result };
                    }),
                );

                const dc = realtimeDcRef.current;
                if (!dc || dc.readyState !== "open") throw new Error("A sessão de voz foi desconectada.");
                for (const item of results) {
                    dc.send(
                        JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "function_call_output",
                                call_id: item.callId,
                                output: JSON.stringify(item.result),
                            },
                        }),
                    );
                }
                dc.send(JSON.stringify({ type: "response.create" }));
            } else if (realtimeState !== "off") {
                setRealtimeState("listening");
            }
            return;
        }
        if (type === "error") {
            throw new Error(String(event?.error?.message || "Erro na sessão de voz em tempo real."));
        }
    }

    async function startRealtimeVoice() {
        if (realtimeState !== "off" || loadingRef.current) return;
        setError("");
        stopCurrentSpeech();
        setRealtimeState("connecting");
        realtimeClosingRef.current = false;

        try {
            if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
                throw new Error("Este navegador não oferece suporte ao modo de voz em tempo real.");
            }

            const mic = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            const pc = new RTCPeerConnection();
            const dc = pc.createDataChannel("oai-events");
            const remoteAudio = document.createElement("audio");
            remoteAudio.autoplay = true;

            realtimeMicRef.current = mic;
            realtimePcRef.current = pc;
            realtimeDcRef.current = dc;
            realtimeAudioRef.current = remoteAudio;

            for (const track of mic.getTracks()) pc.addTrack(track, mic);
            pc.ontrack = (event) => {
                remoteAudio.srcObject = event.streams[0];
                void remoteAudio.play().catch(() => undefined);
            };

            dc.addEventListener("open", () => setRealtimeState("listening"));
            dc.addEventListener("message", (messageEvent) => {
                try {
                    const event = JSON.parse(String(messageEvent.data || "{}"));
                    void handleRealtimeEvent(event).catch((err) => {
                        setError(err instanceof Error ? err.message : "Falha no modo de voz.");
                        stopRealtimeVoice(false);
                    });
                } catch {
                    // Evento desconhecido não interrompe a sessão.
                }
            });
            dc.addEventListener("close", () => {
                if (!realtimeClosingRef.current) {
                    setError("A conversa por voz foi desconectada.");
                }
                cleanupRealtimeRefs();
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const sdp = pc.localDescription?.sdp || offer.sdp;
            if (!sdp) throw new Error("Não foi possível preparar a conexão de voz.");

            const response = await fetch(`${CHAT_API}?action=realtime-session&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/sdp", Accept: "application/sdp" },
                body: sdp,
            });
            if (!response.ok) {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    const json = await response.json().catch(() => null);
                    throw new Error(json?.msg || `Falha ao iniciar voz (HTTP ${response.status}).`);
                }
                throw new Error((await response.text()) || `Falha ao iniciar voz (HTTP ${response.status}).`);
            }
            const answerSdp = await response.text();
            await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
            if (dc.readyState === "open") setRealtimeState("listening");
        } catch (err: unknown) {
            cleanupRealtimeRefs();
            setRealtimeState("off");
            const name = err instanceof DOMException ? err.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                setError("Permita o acesso ao microfone para usar a conversa por voz.");
            } else {
                setError(err instanceof Error ? err.message : "Não foi possível iniciar a voz em tempo real.");
            }
        }
    }

    function cleanupRealtimeRefs() {
        try {
            realtimeDcRef.current?.close();
        } catch {
            // Ignora.
        }
        try {
            realtimePcRef.current?.close();
        } catch {
            // Ignora.
        }
        realtimeMicRef.current?.getTracks().forEach((track) => track.stop());
        const audio = realtimeAudioRef.current;
        if (audio) {
            audio.pause();
            audio.srcObject = null;
        }
        realtimePcRef.current = null;
        realtimeDcRef.current = null;
        realtimeMicRef.current = null;
        realtimeAudioRef.current = null;
        realtimeInputSeenRef.current.clear();
        realtimeAssistantIdsRef.current.clear();
        realtimeToolsRef.current.clear();
        realtimeProductCardsRef.current = [];
        realtimeProductSuggestionsRef.current = [];
        setRealtimeState("off");
    }

    function stopRealtimeVoice(sendClose = true) {
        realtimeClosingRef.current = true;
        const dc = realtimeDcRef.current;
        if (sendClose && dc?.readyState === "open") {
            try {
                dc.send(JSON.stringify({ type: "session.close" }));
            } catch {
                // Fecha localmente abaixo.
            }
        }
        cleanupRealtimeRefs();
    }

    function clearChat() {
        if (loading) return;
        abortRef.current?.abort();
        stopCurrentSpeech();
        stopRealtimeVoice();
        commitMessages([]);
        setInput("");
        setError("");
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Sem impacto.
        }
        requestAnimationFrame(() => textareaRef.current?.focus());
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

    const realtimeLabel =
        realtimeState === "connecting"
            ? "Conectando voz..."
            : realtimeState === "speaking"
                ? "Aurora falando"
                : realtimeState === "consulting"
                    ? "Consultando o sistema"
                    : realtimeState === "listening"
                        ? "Ouvindo, fale normalmente"
                        : "";

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
                                <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">Aurora</h1>
                                <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:inline-flex">
                                    Somente leitura
                                </span>
                            </div>
                            <p className="truncate text-xs text-slate-500">Assistente Administrativo • IA adaptativa, texto em streaming e voz em tempo real</p>
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
                            title="Ler automaticamente respostas de perguntas digitadas"
                        >
                            {voiceAuto ? <IconSpeaker /> : <IconSpeakerOff />}
                            <span className="hidden sm:inline">Voz {voiceAuto ? "ligada" : "desligada"}</span>
                        </button>

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
                                            ) : message.content ? (
                                                <>
                                                    <AssistantContent content={message.content} />
                                                    <ProductCards products={message.productCards} />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading || realtimeState !== "off"}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                </>
                                            ) : (message.productCards?.length || message.productSuggestions?.length) ? (
                                                <>
                                                    <ProductCards products={message.productCards} />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading || realtimeState !== "off"}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-1.5 py-1">
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.25s]" />
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.12s]" />
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                                                </div>
                                            )}
                                        </div>

                                        <div className={["mt-2 flex flex-wrap items-center gap-1.5", isUser ? "justify-end" : "justify-start"].join(" ")}>
                                            {isUser && message.source === "audio" ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-600">
                                                    <IconMic className="h-3 w-3" /> Voz
                                                </span>
                                            ) : null}

                                            {!isUser && message.content && !message.streaming ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void speakMessage(message)}
                                                    className={[
                                                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition",
                                                        speaking ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                                                    ].join(" ")}
                                                    title={speaking ? "Parar áudio" : "Ouvir resposta"}
                                                >
                                                    {speaking ? <IconStop className="h-3 w-3" /> : <IconSpeaker className="h-3 w-3" />}
                                                    {speaking ? "Parar" : "Ouvir"}
                                                </button>
                                            ) : null}

                                            {!isUser && message.toolsUsed?.length
                                                ? message.toolsUsed.map((tool) => (
                                                    <span key={`${message.id}-${tool}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                                                        {toolLabel(tool)}
                                                    </span>
                                                ))
                                                : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {loading && !messages.some((m) => m.streaming && m.role === "assistant") ? <TypingIndicator label="Consultando dados" /> : null}

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
                    {realtimeState !== "off" ? (
                        <div className="mb-2 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                            <div className="flex items-center gap-2 font-semibold">
                                <span className={[
                                    "h-2.5 w-2.5 rounded-full",
                                    realtimeState === "speaking" ? "animate-pulse bg-violet-500" : realtimeState === "consulting" ? "animate-pulse bg-amber-500" : "animate-pulse bg-sky-500",
                                ].join(" ")} />
                                {realtimeLabel}
                            </div>
                            <button type="button" onClick={() => stopRealtimeVoice()} className="rounded-lg px-2 py-1 font-semibold hover:bg-sky-100">
                                Encerrar
                            </button>
                        </div>
                    ) : null}

                    {messages.length > 0 && !loading && realtimeState === "off" ? (
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
                            <button
                                type="button"
                                onClick={() => (realtimeState === "off" ? void startRealtimeVoice() : stopRealtimeVoice())}
                                disabled={loading}
                                className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                                    realtimeState !== "off"
                                        ? "bg-red-600 text-white hover:bg-red-700"
                                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                                ].join(" ")}
                                aria-label={realtimeState === "off" ? "Iniciar conversa por voz em tempo real" : "Encerrar conversa por voz"}
                                title={realtimeState === "off" ? "Conversar por voz em tempo real" : "Encerrar voz"}
                            >
                                {realtimeState !== "off" ? <IconStop className="h-4 w-4" /> : <IconMic className="h-5 w-5" />}
                            </button>

                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading || realtimeState !== "off"}
                                rows={1}
                                maxLength={5000}
                                placeholder={
                                    realtimeState !== "off"
                                        ? "Conversa por voz ativa..."
                                        : loading
                                            ? "Recebendo resposta..."
                                            : "Pergunte por texto ou toque no microfone para conversar..."
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
                            <IconShield className="h-3.5 w-3.5" /> A Aurora consulta dados, mas não altera registros.
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <IconSpeaker className="h-3.5 w-3.5" /> A voz reproduzida é gerada por IA.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
