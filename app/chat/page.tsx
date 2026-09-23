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
type ConversationMode = "text" | "voice";
type RealtimeState = "off" | "connecting" | "listening" | "thinking" | "speaking" | "consulting";

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

type ExportFormat = "pdf" | "xlsx" | "csv" | "txt" | "json";

type ExportCard = {
    id: string;
    title: string;
    filename: string;
    format: ExportFormat;
    format_label: string;
    token: string;
    expires_at?: string | null;
};

type PendingActionKind = "novo_atendimento" | "requisicao_material";
type PendingActionStatus = "pending" | "executing" | "completed" | "cancelled" | "error";

type PendingActionDetail = {
    label: string;
    value: string;
};

type PendingAction = {
    id: string;
    kind: PendingActionKind;
    title: string;
    description: string;
    details: PendingActionDetail[];
    token: string;
    expires_at?: string | null;
    status: PendingActionStatus;
    confirm_label?: string | null;
    result_label?: string | null;
    executed_at?: string | null;
    error?: string | null;
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
    exportCards?: ExportCard[];
    pendingActions?: PendingAction[];
};

type SseEvent = {
    event: string;
    data: any;
};

const QUICK_PROMPTS = [
    "Quantos atendimentos estão no quadro agora?",
    "Quem será sepultado hoje?",
    "Criar um novo atendimento",
    "Requisitar materiais",
    "Quantos AÇÚCAR temos?",
    "Quantas urnas saíram hoje?",
    "Quantas coroas estão em confecção agora?",
    "Qual é o balanço deste mês?",
];

const TOOL_LABELS: Record<string, string> = {
    preparar_novo_atendimento: "Novo atendimento",
    preparar_requisicao_material: "Requisição",
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


function sanitizeExportCards(value: unknown): ExportCard[] {
    if (!Array.isArray(value)) return [];
    const allowed = new Set<ExportFormat>(["pdf", "xlsx", "csv", "txt", "json"]);
    const out: ExportCard[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const format = String(item.format || "").toLowerCase() as ExportFormat;
        const token = String(item.token || "").trim();
        const filename = String(item.filename || "").trim();
        const title = String(item.title || "Arquivo da Aurora").trim();
        if (!allowed.has(format) || !token || !filename) continue;

        out.push({
            id: String(item.id || `${format}-${filename}-${out.length}`),
            title,
            filename,
            format,
            format_label: String(item.format_label || format.toUpperCase()),
            token,
            expires_at: item.expires_at == null ? null : String(item.expires_at),
        });
    }

    return out.slice(0, 5);
}

function exportDownloadUrl(card: ExportCard) {
    return `${CHAT_API}?action=export&token=${encodeURIComponent(card.token)}`;
}

function exportFormatDescription(format: ExportFormat) {
    switch (format) {
        case "pdf":
            return "Documento PDF";
        case "xlsx":
            return "Planilha Excel";
        case "csv":
            return "Arquivo CSV";
        case "txt":
            return "Arquivo de texto";
        case "json":
            return "Dados JSON";
    }
}

function IconDownload({ className = "h-4 w-4" }: { className?: string }) {
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
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
        </svg>
    );
}

function ExportCards({ cards }: { cards?: ExportCard[] }) {
    if (!cards?.length) return null;

    return (
        <div className="mt-3 space-y-2">
            {cards.map((card) => {
                const expiry = card.expires_at ? new Date(card.expires_at) : null;
                const validExpiry = expiry && !Number.isNaN(expiry.getTime());

                return (
                    <div
                        key={card.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                        <div className="flex items-center gap-3 p-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                                <span className="text-[11px] font-bold uppercase">{card.format}</span>
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-950">
                                    {card.title}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                                    {exportFormatDescription(card.format)} • {card.filename}
                                </div>
                                {validExpiry ? (
                                    <div className="mt-0.5 text-[10px] text-slate-400">
                                        Link temporário até {expiry!.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                ) : null}
                            </div>

                            <a
                                href={exportDownloadUrl(card)}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                title={`Baixar ${card.filename}`}
                            >
                                <IconDownload className="h-4 w-4" />
                                Baixar
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


function sanitizePendingActions(value: unknown): PendingAction[] {
    if (!Array.isArray(value)) return [];

    const out: PendingAction[] = [];
    const allowedKinds = new Set<PendingActionKind>(["novo_atendimento", "requisicao_material"]);
    const allowedStatuses = new Set<PendingActionStatus>(["pending", "executing", "completed", "cancelled", "error"]);

    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const id = String(item.id || "").trim();
        const kind = String(item.kind || "") as PendingActionKind;
        const token = String(item.token || "").trim();
        const title = String(item.title || "").trim();
        if (!id || !allowedKinds.has(kind) || !title) continue;

        const statusRaw = String(item.status || "pending") as PendingActionStatus;
        const status = allowedStatuses.has(statusRaw) ? statusRaw : "pending";

        const details: PendingActionDetail[] = Array.isArray(item.details)
            ? item.details
                .map((detail: any) => ({
                    label: String(detail?.label || "").trim(),
                    value: String(detail?.value || "").trim(),
                }))
                .filter((detail: PendingActionDetail) => detail.label && detail.value)
                .slice(0, 20)
            : [];

        out.push({
            id,
            kind,
            title,
            description: String(item.description || "").trim(),
            details,
            token,
            expires_at: item.expires_at == null ? null : String(item.expires_at),
            status,
            confirm_label: item.confirm_label == null ? null : String(item.confirm_label),
            result_label: item.result_label == null ? null : String(item.result_label),
            executed_at: item.executed_at == null ? null : String(item.executed_at),
            error: item.error == null ? null : String(item.error),
        });
    }

    return out.slice(0, 5);
}

function normalizeCommandText(value: string) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.!?;,]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isExplicitConfirmCommand(value: string) {
    const q = normalizeCommandText(value);
    return [
        "sim",
        "confirmar",
        "confirma",
        "confirmo",
        "pode confirmar",
        "pode criar",
        "pode fazer",
        "pode executar",
        "execute",
        "executar",
        "sim pode criar",
        "sim pode fazer",
        "sim pode confirmar",
        "confirmado",
    ].includes(q);
}

function isExplicitCancelCommand(value: string) {
    const q = normalizeCommandText(value);
    return [
        "cancelar",
        "cancela",
        "cancelado",
        "nao",
        "não",
        "nao confirmar",
        "desistir",
        "deixa pra la",
        "deixa para la",
    ].includes(q);
}

function PendingActionCards({
    actions,
    disabled,
    onConfirm,
    onCancel,
}: {
    actions?: PendingAction[];
    disabled?: boolean;
    onConfirm: (action: PendingAction) => void;
    onCancel: (action: PendingAction) => void;
}) {
    if (!actions?.length) return null;

    return (
        <div className="mt-3 space-y-3">
            {actions.map((action) => {
                const expiry = action.expires_at ? new Date(action.expires_at) : null;
                const expired = Boolean(expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now());
                const pending = action.status === "pending" || action.status === "error";
                const executing = action.status === "executing";
                const completed = action.status === "completed";
                const cancelled = action.status === "cancelled";

                return (
                    <div
                        key={action.id}
                        className={[
                            "overflow-hidden rounded-2xl border",
                            completed
                                ? "border-emerald-200 bg-emerald-50/70"
                                : cancelled
                                    ? "border-slate-200 bg-slate-50"
                                    : action.status === "error"
                                        ? "border-red-200 bg-red-50/70"
                                        : "border-amber-200 bg-amber-50/70",
                        ].join(" ")}
                    >
                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                <div
                                    className={[
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                                        completed
                                            ? "bg-emerald-100 text-emerald-700"
                                            : cancelled
                                                ? "bg-slate-200 text-slate-600"
                                                : "bg-amber-100 text-amber-700",
                                    ].join(" ")}
                                >
                                    {action.kind === "novo_atendimento" ? "ATD" : "REQ"}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-950">{action.title}</div>
                                    {action.description ? (
                                        <div className="mt-1 text-xs leading-5 text-slate-600">{action.description}</div>
                                    ) : null}
                                </div>

                                <span
                                    className={[
                                        "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                                        completed
                                            ? "bg-emerald-100 text-emerald-700"
                                            : cancelled
                                                ? "bg-slate-200 text-slate-600"
                                                : executing
                                                    ? "bg-sky-100 text-sky-700"
                                                    : action.status === "error"
                                                        ? "bg-red-100 text-red-700"
                                                        : "bg-amber-100 text-amber-700",
                                    ].join(" ")}
                                >
                                    {completed
                                        ? "Concluída"
                                        : cancelled
                                            ? "Cancelada"
                                            : executing
                                                ? "Executando"
                                                : action.status === "error"
                                                    ? "Falhou"
                                                    : expired
                                                        ? "Expirada"
                                                        : "Aguardando confirmação"}
                                </span>
                            </div>

                            {action.details.length ? (
                                <div className="mt-3 grid gap-1.5 rounded-xl bg-white/80 p-3 ring-1 ring-inset ring-slate-200/70">
                                    {action.details.map((detail, index) => (
                                        <div key={`${action.id}-detail-${index}`} className="grid grid-cols-[minmax(90px,0.42fr)_1fr] gap-3 text-xs">
                                            <span className="text-slate-500">{detail.label}</span>
                                            <span className="break-words font-medium text-slate-800">{detail.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {action.result_label ? (
                                <div className="mt-3 text-xs font-semibold text-emerald-700">
                                    {action.result_label}
                                </div>
                            ) : null}

                            {action.error ? (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                    {action.error}
                                </div>
                            ) : null}

                            {pending && !expired ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={disabled || executing}
                                        onClick={() => onConfirm(action)}
                                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {action.status === "error" ? "Tentar novamente" : (action.confirm_label || "Confirmar")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={disabled || executing}
                                        onClick={() => onCancel(action)}
                                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <span className="self-center text-[10px] text-slate-500">
                                        Você também pode dizer ou digitar “confirmar”.
                                    </span>
                                </div>
                            ) : null}

                            {expired && pending ? (
                                <div className="mt-3 text-xs text-amber-700">
                                    Esta confirmação expirou. Peça à Aurora para preparar a ação novamente.
                                </div>
                            ) : null}
                        </div>
                    </div>
                );
            })}
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
                exportCards: sanitizeExportCards(item.exportCards),
                pendingActions: sanitizePendingActions(item.pendingActions),
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

function IconKeyboard({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h.01M11 14h6" />
        </svg>
    );
}

function IconHeadphones({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
            <path d="M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3ZM20 14a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z" />
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
                Assistente Administrativo do PAI. Consulta dados, gera arquivos e prepara ações administrativas que só são executadas após sua confirmação.
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


function VoiceEmptyState({
    state,
    onStart,
    error,
}: {
    state: RealtimeState;
    onStart: () => void;
    error?: string;
}) {
    const active = state !== "off";
    const title =
        state === "connecting"
            ? "Conectando com a Aurora..."
            : state === "speaking"
                ? "Aurora está falando"
                : state === "consulting"
                    ? "Consultando o sistema"
                    : state === "thinking"
                        ? "Entendendo sua pergunta"
                        : active
                            ? "Pode falar normalmente"
                            : "Conversa natural por voz";

    return (
        <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
            <div className={[
                "relative mb-6 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-xl transition",
                active ? "bg-sky-600 shadow-sky-200" : "bg-slate-950 shadow-slate-200",
            ].join(" ")}>
                {active ? <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/20" /> : null}
                <IconHeadphones className="relative h-10 w-10" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                {active
                    ? "A sessão fica aberta. Faça perguntas em sequência, use referências como “ele”, “ela” ou “essa coroa” e interrompa a Aurora quando quiser."
                    : "Converse com a Aurora sem apertar o microfone a cada pergunta. A voz Bossa fala em português do Brasil e a sessão continua ouvindo depois da resposta."}
            </p>
            {error ? (
                <div className="mt-5 w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm leading-5 text-red-700">
                    {error}
                </div>
            ) : null}
            {!active ? (
                <button
                    type="button"
                    onClick={onStart}
                    className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 active:scale-[0.99]"
                >
                    <IconMic className="h-5 w-5" /> Iniciar conversa natural
                </button>
            ) : (
                <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="rounded-full bg-sky-50 px-3 py-1.5 font-medium text-sky-700 ring-1 ring-inset ring-sky-200">Microfone ativo</span>
                    <span className="rounded-full bg-violet-50 px-3 py-1.5 font-medium text-violet-700 ring-1 ring-inset ring-violet-200">Interrupção habilitada</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Ações com confirmação</span>
                </div>
            )}
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
    const [conversationMode, setConversationMode] = useState<ConversationMode>("text");

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
    const realtimeSessionReadyRef = useRef(false);
    const realtimeConnectTimeoutRef = useRef<number | null>(null);
    const liveInputTranscriptRef = useRef("");
    const liveCurrentUserMessageIdRef = useRef<string | null>(null);
    const liveCurrentAssistantMessageIdRef = useRef<string | null>(null);
    const liveDelegationsInFlightRef = useRef<Set<string>>(new Set());
    const liveAssistantFinalizeTimerRef = useRef<number | null>(null);
    const liveSessionIdRef = useRef<string | null>(null);
    const realtimeExportCardsRef = useRef<ExportCard[]>([]);
    const realtimePendingActionsRef = useRef<PendingAction[]>([]);
    const pendingActionBusyRef = useRef<Set<string>>(new Set());

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
        () => conversationMode === "text" && input.trim().length > 0 && !loading && realtimeState === "off",
        [conversationMode, input, loading, realtimeState],
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

    function updatePendingActionEverywhere(
        actionId: string,
        patch: Partial<PendingAction>,
    ) {
        const next = messagesRef.current.map((message) => {
            if (!message.pendingActions?.length) return message;
            let changed = false;
            const pendingActions = message.pendingActions.map((action) => {
                if (action.id !== actionId) return action;
                changed = true;
                return { ...action, ...patch };
            });
            return changed ? { ...message, pendingActions } : message;
        });
        commitMessages(next);
    }

    function latestPendingAction() {
        for (let i = messagesRef.current.length - 1; i >= 0; i--) {
            const actions = messagesRef.current[i]?.pendingActions || [];
            for (let j = actions.length - 1; j >= 0; j--) {
                const action = actions[j];
                if (action.status !== "pending" && action.status !== "error") continue;

                const expiry = action.expires_at ? new Date(action.expires_at) : null;
                if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
                    continue;
                }
                return action;
            }
        }
        return null;
    }

    async function callPendingAction(
        action: PendingAction,
        decision: "execute" | "cancel",
    ) {
        if (!action.token) throw new Error("A confirmação desta ação é inválida.");
        if (pendingActionBusyRef.current.has(action.id)) {
            throw new Error("Esta ação já está sendo processada.");
        }

        pendingActionBusyRef.current.add(action.id);
        updatePendingActionEverywhere(action.id, {
            status: "executing",
            error: null,
        });

        try {
            const endpoint = decision === "execute" ? "execute-pending" : "cancel-pending";
            const response = await fetch(`${CHAT_API}?action=${endpoint}&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: action.token }),
            });

            const json = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    reply?: string;
                    msg?: string;
                    need_login?: 1;
                    action_update?: {
                        id?: string;
                        status?: PendingActionStatus;
                        result_label?: string | null;
                        executed_at?: string | null;
                    };
                }
                | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }

            if (!response.ok || !json?.ok) {
                throw new Error(json?.msg || `Falha ao ${decision === "execute" ? "executar" : "cancelar"} a ação.`);
            }

            const update = json.action_update || {};
            updatePendingActionEverywhere(action.id, {
                status:
                    update.status ||
                    (decision === "execute" ? "completed" : "cancelled"),
                result_label:
                    update.result_label == null
                        ? decision === "execute"
                            ? "Concluída"
                            : "Cancelada"
                        : String(update.result_label),
                executed_at:
                    update.executed_at == null ? nowIso() : String(update.executed_at),
                error: null,
            });

            return String(
                json.reply ||
                (decision === "execute"
                    ? "Ação concluída com sucesso."
                    : "Ação cancelada."),
            ).trim();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Falha ao processar a ação.";
            updatePendingActionEverywhere(action.id, {
                status: decision === "cancel" ? "pending" : "error",
                error: message,
            });
            throw err;
        } finally {
            pendingActionBusyRef.current.delete(action.id);
        }
    }

    async function runPendingActionFromText(
        action: PendingAction,
        decision: "execute" | "cancel",
        commandText?: string,
    ) {
        if (loadingRef.current || realtimeState !== "off") return;

        setError("");
        setInput("");
        stopCurrentSpeech();

        if (commandText?.trim()) {
            appendMessage({
                id: makeId("user-action"),
                role: "user",
                content: commandText.trim(),
                createdAt: nowIso(),
                source: "text",
                streaming: false,
            });
        }

        loadingRef.current = true;
        setLoading(true);

        try {
            const reply = await callPendingAction(action, decision);
            const message: ChatMessage = {
                id: makeId("assistant-action"),
                role: "assistant",
                content: reply,
                createdAt: nowIso(),
                toolsUsed: [],
                source: "text",
                streaming: false,
            };
            appendMessage(message);
            if (voiceAutoRef.current) void speakMessage(message);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Falha ao processar a ação.");
        } finally {
            loadingRef.current = false;
            setLoading(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
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

        const pending = latestPendingAction();
        if (pending && isExplicitConfirmCommand(text)) {
            await runPendingActionFromText(pending, "execute", text);
            return;
        }
        if (pending && isExplicitCancelCommand(text)) {
            await runPendingActionFromText(pending, "cancel", text);
            return;
        }

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
        let finalExportCards: ExportCard[] = [];
        let finalPendingActions: PendingAction[] = [];
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
                    if (Array.isArray(data?.export_cards)) finalExportCards = sanitizeExportCards(data.export_cards);
                    if (Array.isArray(data?.pending_actions)) finalPendingActions = sanitizePendingActions(data.pending_actions);
                    updateMessage(assistantId, (m) => ({
                        ...m,
                        toolsUsed: finalTools,
                        productCards: finalProductCards,
                        productSuggestions: finalProductSuggestions,
                        exportCards: finalExportCards,
                        pendingActions: finalPendingActions,
                    }));
                } else if (event === "done") {
                    if (Array.isArray(data?.tools_used)) finalTools = data.tools_used.map(String);
                    if (Array.isArray(data?.product_cards)) finalProductCards = sanitizeProductCards(data.product_cards);
                    if (Array.isArray(data?.product_suggestions)) finalProductSuggestions = sanitizeProductSuggestions(data.product_suggestions);
                    if (Array.isArray(data?.export_cards)) finalExportCards = sanitizeExportCards(data.export_cards);
                    if (Array.isArray(data?.pending_actions)) finalPendingActions = sanitizePendingActions(data.pending_actions);
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
                exportCards: finalExportCards,
                pendingActions: finalPendingActions,
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

    function seedRealtimeContext(dc: RTCDataChannel) {
        const recent = messagesRef.current
            .filter((message) => message.content.trim() && !message.streaming)
            .slice(-6);

        if (!recent.length || dc.readyState !== "open") return;

        const transcript = recent
            .map((message) => `${message.role === "user" ? "Usuário" : "Aurora"}: ${message.content.trim()}`)
            .join("\n");

        // GPT-Live aceita contexto silencioso pelo canal de dados.
        // O limite de append é pequeno, por isso mantemos só o contexto recente.
        const content = [
            "Contexto recente do chat antes de entrar na voz. Use apenas como memória:",
            transcript,
        ].join("\n").slice(0, 1700);

        dc.send(
            JSON.stringify({
                type: "session.thinking.append",
                delegation_id: null,
                content,
            }),
        );
    }

    function clearLiveAssistantFinalizeTimer() {
        if (liveAssistantFinalizeTimerRef.current != null) {
            window.clearTimeout(liveAssistantFinalizeTimerRef.current);
            liveAssistantFinalizeTimerRef.current = null;
        }
    }

    function finalizeLiveAssistantMessage() {
        clearLiveAssistantFinalizeTimer();
        const id = liveCurrentAssistantMessageIdRef.current;
        if (id) {
            updateMessage(id, (m) => ({ ...m, streaming: false }));
        }
        liveCurrentAssistantMessageIdRef.current = null;
    }

    function scheduleLiveAssistantFinalize() {
        clearLiveAssistantFinalizeTimer();
        liveAssistantFinalizeTimerRef.current = window.setTimeout(() => {
            finalizeLiveAssistantMessage();
            if (realtimeState !== "off" && realtimeState !== "consulting") {
                setRealtimeState("listening");
            }
        }, 1200);
    }

    function finalizeLiveUserTranscript() {
        const text = liveInputTranscriptRef.current.trim();
        const id = liveCurrentUserMessageIdRef.current;

        if (id) {
            if (text) {
                updateMessage(id, (m) => ({ ...m, content: text, streaming: false }));
            } else {
                commitMessages(messagesRef.current.filter((m) => m.id !== id));
            }
        } else if (text) {
            appendMessage({
                id: makeId("user-voice"),
                role: "user",
                content: text,
                createdAt: nowIso(),
                source: "audio",
                streaming: false,
            });
        }

        liveInputTranscriptRef.current = "";
        liveCurrentUserMessageIdRef.current = null;
        return text;
    }

    function appendLiveInputDelta(delta: string) {
        if (!delta) return;

        // Se a Aurora ainda tinha uma bolha de resposta em streaming, a nova fala
        // do usuário marca o fim visual dessa resposta.
        finalizeLiveAssistantMessage();

        if (!liveCurrentUserMessageIdRef.current) {
            realtimeToolsRef.current.clear();
            realtimeProductCardsRef.current = [];
            realtimeProductSuggestionsRef.current = [];
            realtimeExportCardsRef.current = [];
            realtimePendingActionsRef.current = [];

            const id = makeId("user-voice");
            liveCurrentUserMessageIdRef.current = id;
            liveInputTranscriptRef.current = "";
            appendMessage({
                id,
                role: "user",
                content: "",
                createdAt: nowIso(),
                source: "audio",
                streaming: true,
            });
        }

        liveInputTranscriptRef.current += delta;
        const id = liveCurrentUserMessageIdRef.current;
        if (id) {
            updateMessage(id, (m) => ({
                ...m,
                content: liveInputTranscriptRef.current,
                streaming: true,
            }));
        }

        setRealtimeState("listening");
    }

    function appendLiveOutputDelta(delta: string) {
        if (!delta) return;

        // Quando a Aurora começa a responder, o turno do usuário já pode ser
        // consolidado no histórico.
        finalizeLiveUserTranscript();

        let id = liveCurrentAssistantMessageIdRef.current;
        if (!id) {
            id = makeId("assistant-voice");
            liveCurrentAssistantMessageIdRef.current = id;
            appendMessage({
                id,
                role: "assistant",
                content: "",
                createdAt: nowIso(),
                toolsUsed: Array.from(realtimeToolsRef.current),
                productCards: realtimeProductCardsRef.current,
                productSuggestions: realtimeProductSuggestionsRef.current,
                exportCards: realtimeExportCardsRef.current,
                pendingActions: realtimePendingActionsRef.current,
                source: "audio",
                streaming: true,
            });
        }

        updateMessage(id, (m) => ({
            ...m,
            content: m.content + delta,
            toolsUsed: Array.from(realtimeToolsRef.current),
            productCards: realtimeProductCardsRef.current,
            productSuggestions: realtimeProductSuggestionsRef.current,
            exportCards: realtimeExportCardsRef.current,
            pendingActions: realtimePendingActionsRef.current,
            streaming: true,
        }));

        setRealtimeState("speaking");
        scheduleLiveAssistantFinalize();
    }

    function splitLiveCommentary(text: string, maxChars = 1500) {
        const clean = stripMarkdownForSpeech(text);
        if (!clean) return [];
        if (clean.length <= maxChars) return [clean];

        const out: string[] = [];
        let rest = clean;
        while (rest.length > maxChars && out.length < 3) {
            const sample = rest.slice(0, maxChars + 1);
            let cut = Math.max(
                sample.lastIndexOf(". "),
                sample.lastIndexOf("? "),
                sample.lastIndexOf("! "),
                sample.lastIndexOf("; "),
            );
            if (cut < Math.floor(maxChars * 0.55)) cut = sample.lastIndexOf(" ");
            if (cut < Math.floor(maxChars * 0.35)) cut = maxChars;
            else cut += 1;
            out.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        if (rest && out.length < 3) out.push(rest.slice(0, maxChars).trim());
        return out.filter(Boolean);
    }

    async function runLiveDelegation(delegationId: string) {
        if (!delegationId || liveDelegationsInFlightRef.current.has(delegationId)) return;
        liveDelegationsInFlightRef.current.add(delegationId);

        try {
            // Os deltas de transcrição e o evento de delegação são independentes.
            // Uma pequena espera permite receber os últimos fragmentos do turno.
            await new Promise((resolve) => window.setTimeout(resolve, 180));

            const spoken = finalizeLiveUserTranscript();

            const pendingAction = latestPendingAction();
            if (pendingAction && (isExplicitConfirmCommand(spoken) || isExplicitCancelCommand(spoken))) {
                setRealtimeState("consulting");
                const decision = isExplicitCancelCommand(spoken) ? "cancel" : "execute";
                const reply = await callPendingAction(pendingAction, decision);

                const dc = realtimeDcRef.current;
                if (!dc || dc.readyState !== "open") {
                    throw new Error("A conversa por voz foi desconectada.");
                }

                dc.send(
                    JSON.stringify({
                        type: "session.commentary.append",
                        delegation_id: delegationId,
                        content: reply,
                    }),
                );
                return;
            }

            const recent = messagesRef.current
                .filter((m) => m.content.trim() && !m.streaming)
                .slice(-MAX_HISTORY_TO_API)
                .map(({ role, content }) => ({ role, content }));

            // Se, por alguma condição de rede, a transcrição ainda não tiver
            // entrado na lista, garantimos que a fala capturada esteja presente.
            if (
                spoken &&
                (!recent.length ||
                    recent[recent.length - 1]?.role !== "user" ||
                    recent[recent.length - 1]?.content.trim() !== spoken.trim())
            ) {
                recent.push({ role: "user", content: spoken });
            }

            if (!recent.length || recent[recent.length - 1]?.role !== "user") {
                throw new Error("Não consegui identificar a pergunta falada. Tente novamente.");
            }

            setRealtimeState("consulting");

            const response = await fetch(`${CHAT_API}?action=chat&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: recent }),
            });

            const json = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    reply?: string;
                    tools_used?: string[];
                    product_cards?: unknown;
                    product_suggestions?: unknown;
                    export_cards?: unknown;
                    pending_actions?: unknown;
                    msg?: string;
                    need_login?: 1;
                }
                | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }
            if (!response.ok || !json?.ok) {
                throw new Error(json?.msg || `Falha ao consultar o PAI (HTTP ${response.status}).`);
            }

            const reply = String(json.reply || "").trim();
            if (!reply) throw new Error("O backend não retornou uma resposta para a Aurora.");

            realtimeToolsRef.current = new Set(
                Array.isArray(json.tools_used) ? json.tools_used.map(String) : [],
            );
            realtimeProductCardsRef.current = sanitizeProductCards(json.product_cards);
            realtimeProductSuggestionsRef.current = sanitizeProductSuggestions(json.product_suggestions);
            realtimeExportCardsRef.current = sanitizeExportCards(json.export_cards);
            realtimePendingActionsRef.current = sanitizePendingActions(json.pending_actions);

            const dc = realtimeDcRef.current;
            if (!dc || dc.readyState !== "open") throw new Error("A conversa por voz foi desconectada.");

            // GPT-Live recebe os fatos validados e escolhe como dizê-los em
            // português brasileiro usando a voz Bossa.
            for (const chunk of splitLiveCommentary(reply)) {
                dc.send(
                    JSON.stringify({
                        type: "session.commentary.append",
                        delegation_id: delegationId,
                        content: chunk,
                    }),
                );
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Não consegui consultar os dados agora.";
            setError(message);

            const dc = realtimeDcRef.current;
            if (dc?.readyState === "open") {
                dc.send(
                    JSON.stringify({
                        type: "session.commentary.append",
                        delegation_id: delegationId,
                        content: "Não consegui concluir essa consulta agora. Avise ao usuário de forma curta que houve uma falha temporária e que ele pode tentar novamente.",
                    }),
                );
            }
        } finally {
            liveDelegationsInFlightRef.current.delete(delegationId);
        }
    }

    async function handleRealtimeEvent(event: any) {
        const type = String(event?.type || "");

        if (type === "session.started") {
            if (realtimeConnectTimeoutRef.current != null) {
                window.clearTimeout(realtimeConnectTimeoutRef.current);
                realtimeConnectTimeoutRef.current = null;
            }

            realtimeSessionReadyRef.current = true;
            const sessionId = String(event?.session?.id || "").trim();
            if (sessionId) liveSessionIdRef.current = sessionId;

            const dc = realtimeDcRef.current;
            if (dc && dc.readyState === "open") seedRealtimeContext(dc);

            setRealtimeState("listening");
            return;
        }

        if (type === "session.updated") {
            return;
        }

        if (type === "session.input_transcript.delta") {
            appendLiveInputDelta(String(event?.delta || ""));
            return;
        }

        if (type === "session.output_transcript.delta") {
            appendLiveOutputDelta(String(event?.delta || ""));
            return;
        }

        if (type === "session.delegation.created") {
            const delegationId = String(event?.delegation?.id || "").trim();
            if (delegationId) {
                setRealtimeState("consulting");
                void runLiveDelegation(delegationId);
            }
            return;
        }

        if (type === "session.closed") {
            finalizeLiveUserTranscript();
            finalizeLiveAssistantMessage();
            cleanupRealtimeRefs();
            return;
        }

        if (type === "session.usage.updated") {
            return;
        }

        if (type === "error") {
            const message = String(
                event?.error?.message ||
                event?.message ||
                "Erro na sessão de voz natural.",
            );
            setError(message);
            return;
        }

        // O contrato Live pode ganhar novos eventos. Eventos desconhecidos não
        // devem derrubar a chamada.
    }

    function normalizeRemoteSdp(raw: string) {
        const source = String(raw || "")
            .replace(/^\uFEFF/, "")
            .replace(/\u0000/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        const lines = source
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        const first = lines.findIndex((line) => line === "v=0");
        if (first < 0) throw new Error("O servidor não devolveu um SDP WebRTC válido.");

        const valid: string[] = [];
        for (const line of lines.slice(first)) {
            if (!/^[a-z]=/i.test(line)) break;
            valid.push(line);
        }

        if (!valid.length || valid[0] !== "v=0") {
            throw new Error("A resposta WebRTC recebida é inválida.");
        }

        return `${valid.join("\r\n")}\r\n`;
    }

    function normalizeLocalSdp(raw: string) {
        const source = String(raw || "")
            .replace(/^\uFEFF/, "")
            .replace(/\u0000/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        const lines = source
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        const first = lines.findIndex((line) => line === "v=0");
        if (first < 0) throw new Error("Não foi possível gerar uma oferta SDP WebRTC válida.");

        const valid: string[] = [];
        for (const line of lines.slice(first)) {
            if (!/^[a-z]=/i.test(line)) {
                throw new Error("A oferta WebRTC gerada pelo navegador contém uma linha SDP inválida.");
            }
            valid.push(line);
        }

        if (!valid.length || valid[0] !== "v=0") {
            throw new Error("A oferta WebRTC gerada pelo navegador é inválida.");
        }

        // A terminação CRLF é importante para parsers SDP estritos.
        return `${valid.join("\r\n")}\r\n`;
    }

    async function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 2500) {
        if (pc.iceGatheringState === "complete") return;

        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                pc.removeEventListener("icegatheringstatechange", onChange);
                window.clearTimeout(timer);
                resolve();
            };
            const onChange = () => {
                if (pc.iceGatheringState === "complete") finish();
            };
            const timer = window.setTimeout(finish, timeoutMs);
            pc.addEventListener("icegatheringstatechange", onChange);
        });
    }

    async function startRealtimeVoice() {
        if (realtimeState !== "off" || loadingRef.current) return;

        setConversationMode("voice");
        setError("");
        stopCurrentSpeech();
        setRealtimeState("connecting");
        realtimeClosingRef.current = false;
        realtimeSessionReadyRef.current = false;
        liveSessionIdRef.current = null;
        liveInputTranscriptRef.current = "";
        liveCurrentUserMessageIdRef.current = null;
        liveCurrentAssistantMessageIdRef.current = null;
        liveDelegationsInFlightRef.current.clear();

        try {
            if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
                throw new Error("Este navegador não oferece suporte ao modo de voz natural.");
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

            if (realtimeConnectTimeoutRef.current != null) {
                window.clearTimeout(realtimeConnectTimeoutRef.current);
            }
            realtimeConnectTimeoutRef.current = window.setTimeout(() => {
                if (!realtimeSessionReadyRef.current && !realtimeClosingRef.current) {
                    setError("A conexão com a voz brasileira da Aurora demorou demais. Tente novamente.");
                    realtimeClosingRef.current = true;
                    stopRealtimeVoice(false);
                }
            }, 18000);

            for (const track of mic.getTracks()) pc.addTrack(track, mic);

            pc.ontrack = (event) => {
                const [stream] = event.streams;
                if (!stream) return;
                remoteAudio.srcObject = stream;
                void remoteAudio.play().catch(() => undefined);
            };

            let connectionOpened = false;

            dc.addEventListener("open", () => {
                connectionOpened = true;
            });

            dc.addEventListener("message", (messageEvent) => {
                try {
                    const event = JSON.parse(String(messageEvent.data || "{}"));
                    void handleRealtimeEvent(event).catch((err) => {
                        setError(err instanceof Error ? err.message : "Falha no modo de voz natural.");
                    });
                } catch {
                    // Um evento desconhecido não encerra a conversa.
                }
            });

            dc.addEventListener("close", () => {
                if (!realtimeClosingRef.current) {
                    setError(
                        !connectionOpened
                            ? "Não foi possível concluir a conexão de voz. Tente iniciar novamente."
                            : "A conversa por voz foi desconectada.",
                    );
                }
                cleanupRealtimeRefs();
            });

            pc.addEventListener("connectionstatechange", () => {
                if (pc.connectionState === "failed" && !realtimeClosingRef.current) {
                    setError("A conexão WebRTC da voz falhou. Tente iniciar novamente.");
                    realtimeClosingRef.current = true;
                    stopRealtimeVoice(false);
                }
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await waitForIceGatheringComplete(pc);

            const rawOfferSdp = String(pc.localDescription?.sdp || offer.sdp || "");
            const offerSdp = normalizeLocalSdp(rawOfferSdp);
            if (!offerSdp) throw new Error("Não foi possível preparar a conexão de voz.");

            const response = await fetch(`${CHAT_API}?action=live-session&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ sdp: offerSdp }),
            });

            const json = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    session_id?: string;
                    sdp?: string;
                    model?: string;
                    voice?: string;
                    language?: string;
                    msg?: string;
                    need_login?: 1;
                }
                | null;

            if (!response.ok || !json?.ok) {
                if (response.status === 401 || json?.need_login) {
                    throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
                }
                throw new Error(json?.msg || `Falha ao iniciar voz (HTTP ${response.status}).`);
            }

            const answerSdp = normalizeLocalSdp(String(json.sdp || ""));
            if (!answerSdp) throw new Error("O servidor não devolveu a resposta WebRTC.");

            liveSessionIdRef.current = String(json.session_id || "").trim() || null;

            await pc.setRemoteDescription({
                type: "answer",
                sdp: answerSdp,
            });

            // O GPT-Live envia session.started pelo canal de dados. Só então
            // mostramos "Ouvindo", garantindo que a voz Bossa esteja ativa.
        } catch (err: unknown) {
            realtimeClosingRef.current = true;
            cleanupRealtimeRefs();
            setRealtimeState("off");

            const name = err instanceof DOMException ? err.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                setError("Permita o acesso ao microfone para usar a conversa por voz.");
            } else {
                setError(err instanceof Error ? err.message : "Não foi possível iniciar a voz natural.");
            }

            window.setTimeout(() => {
                realtimeClosingRef.current = false;
            }, 0);
        }
    }

    function cleanupRealtimeRefs() {
        if (realtimeConnectTimeoutRef.current != null) {
            window.clearTimeout(realtimeConnectTimeoutRef.current);
            realtimeConnectTimeoutRef.current = null;
        }
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
        realtimeSessionReadyRef.current = false;
        realtimeMicRef.current = null;
        realtimeAudioRef.current = null;
        realtimeInputSeenRef.current.clear();
        realtimeAssistantIdsRef.current.clear();
        realtimeToolsRef.current.clear();
        realtimeProductCardsRef.current = [];
        realtimeProductSuggestionsRef.current = [];
        realtimeExportCardsRef.current = [];
        realtimePendingActionsRef.current = [];
        liveInputTranscriptRef.current = "";
        liveCurrentUserMessageIdRef.current = null;
        liveCurrentAssistantMessageIdRef.current = null;
        liveDelegationsInFlightRef.current.clear();
        liveSessionIdRef.current = null;
        clearLiveAssistantFinalizeTimer();
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

    async function switchConversationMode(nextMode: ConversationMode) {
        if (nextMode === conversationMode) {
            if (nextMode === "voice" && realtimeState === "off" && !loadingRef.current) {
                await startRealtimeVoice();
            }
            return;
        }

        setError("");
        if (nextMode === "text") {
            stopRealtimeVoice();
            setConversationMode("text");
            requestAnimationFrame(() => textareaRef.current?.focus());
            return;
        }

        if (loadingRef.current) return;
        stopCurrentSpeech();
        setInput("");
        setConversationMode("voice");
        await startRealtimeVoice();
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
                    : realtimeState === "thinking"
                        ? "Entendendo sua pergunta"
                        : realtimeState === "listening"
                            ? "Ouvindo, fale normalmente"
                            : "Conversa por voz pronta";

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
                                    Ações confirmadas
                                </span>
                            </div>
                            <p className="truncate text-xs text-slate-500">Assistente Administrativo • IA adaptativa, texto em streaming e voz em tempo real</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {conversationMode === "text" ? (
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
                        ) : null}

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
                <div className="border-t border-slate-100/80 px-3 py-2 sm:px-6">
                    <div className="mx-auto flex w-full max-w-3xl rounded-xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => void switchConversationMode("text")}
                            disabled={loading}
                            className={[
                                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm",
                                conversationMode === "text"
                                    ? "bg-white text-slate-950 shadow-sm"
                                    : "text-slate-500 hover:text-slate-800",
                            ].join(" ")}
                        >
                            <IconKeyboard className="h-4 w-4" /> Modo texto
                        </button>
                        <button
                            type="button"
                            onClick={() => void switchConversationMode("voice")}
                            disabled={loading}
                            className={[
                                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm",
                                conversationMode === "voice"
                                    ? "bg-white text-sky-700 shadow-sm"
                                    : "text-slate-500 hover:text-slate-800",
                            ].join(" ")}
                        >
                            <IconHeadphones className="h-4 w-4" /> Modo voz natural
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 sm:px-6">
                {!hydrated ? (
                    <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-400">Carregando chat...</div>
                ) : messages.length === 0 ? (
                    conversationMode === "voice" ? (
                        <VoiceEmptyState state={realtimeState} onStart={() => void startRealtimeVoice()} error={error} />
                    ) : (
                        <EmptyState onPrompt={(prompt) => void sendMessage(prompt)} />
                    )
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
                                                    <ExportCards cards={message.exportCards} />
                                                    <PendingActionCards
                                                        actions={message.pendingActions}
                                                        disabled={loading || realtimeState !== "off"}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading || realtimeState !== "off"}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                </>
                                            ) : (message.productCards?.length || message.productSuggestions?.length || message.exportCards?.length || message.pendingActions?.length) ? (
                                                <>
                                                    <ProductCards products={message.productCards} />
                                                    <ExportCards cards={message.exportCards} />
                                                    <PendingActionCards
                                                        actions={message.pendingActions}
                                                        disabled={loading || realtimeState !== "off"}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
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
                    {conversationMode === "text" && messages.length > 0 && !loading && realtimeState === "off" ? (
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

                    {conversationMode === "text" ? (
                        <form
                            onSubmit={handleSubmit}
                            className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200/70"
                        >
                            <div className="flex items-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => void switchConversationMode("voice")}
                                    disabled={loading}
                                    className={[
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                                        "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                                    ].join(" ")}
                                    aria-label="Abrir modo voz natural"
                                    title="Abrir modo voz natural"
                                >
                                    <IconMic className="h-5 w-5" />
                                </button>

                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={loading || realtimeState !== "off"}
                                    rows={1}
                                    maxLength={5000}
                                    placeholder={loading ? "Recebendo resposta..." : "Pergunte por texto..."}
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
                    ) : (
                        <div className="rounded-2xl border border-sky-200 bg-white p-3 shadow-lg shadow-sky-100/60">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => (realtimeState === "off" ? void startRealtimeVoice() : stopRealtimeVoice())}
                                    className={[
                                        "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                                        realtimeState === "off"
                                            ? "bg-slate-950 text-white hover:bg-slate-800"
                                            : realtimeState === "speaking"
                                                ? "bg-violet-600 text-white"
                                                : realtimeState === "consulting" || realtimeState === "thinking"
                                                    ? "bg-amber-500 text-white"
                                                    : "bg-sky-600 text-white",
                                    ].join(" ")}
                                    aria-label={realtimeState === "off" ? "Iniciar conversa natural" : "Encerrar conversa natural"}
                                >
                                    {realtimeState === "off" ? <IconMic className="h-5 w-5" /> : <IconStop className="h-4 w-4" />}
                                    {realtimeState !== "off" ? <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-sky-400/20" /> : null}
                                </button>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={[
                                            "h-2.5 w-2.5 shrink-0 rounded-full",
                                            realtimeState === "off"
                                                ? "bg-slate-300"
                                                : realtimeState === "speaking"
                                                    ? "animate-pulse bg-violet-500"
                                                    : realtimeState === "consulting" || realtimeState === "thinking"
                                                        ? "animate-pulse bg-amber-500"
                                                        : "animate-pulse bg-sky-500",
                                        ].join(" ")} />
                                        <div className="truncate text-sm font-semibold text-slate-900">{realtimeLabel}</div>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {realtimeState === "off"
                                            ? "Toque em iniciar e converse sem apertar o microfone novamente."
                                            : "A sessão continua ouvindo após cada resposta. Você pode interromper a Aurora a qualquer momento."}
                                    </p>
                                </div>

                                {realtimeState !== "off" ? (
                                    <button
                                        type="button"
                                        onClick={() => stopRealtimeVoice()}
                                        className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                                    >
                                        Encerrar
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void startRealtimeVoice()}
                                        className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                                    >
                                        Iniciar
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[10px] text-slate-400 sm:text-xs">
                        <span className="inline-flex items-center gap-1.5">
                            <IconShield className="h-3.5 w-3.5" /> A Aurora consulta dados, mas não altera registros. Texto e voz ficam no mesmo histórico.
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
