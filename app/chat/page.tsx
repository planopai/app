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
const MAX_HISTORY_TO_API = 8;

type Role = "user" | "assistant";

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
                                        Você também pode digitar “confirmar”.
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
                    <IconShield /> Consultas controladas
                </div>
                <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                    <IconShield /> Ações só após confirmação
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

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const loadingRef = useRef(false);
    const pendingActionBusyRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const stored = loadStoredMessages();
        messagesRef.current = stored;
        setMessages(stored);
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
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, loading]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const canSend = useMemo(
        () => input.trim().length > 0 && !loading,
        [input, loading],
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

    function updatePendingActionEverywhere(actionId: string, patch: Partial<PendingAction>) {
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
                if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) continue;
                return action;
            }
        }
        return null;
    }

    async function callPendingAction(action: PendingAction, decision: "execute" | "cancel") {
        if (!action.token) throw new Error("A confirmação desta ação é inválida.");
        if (pendingActionBusyRef.current.has(action.id)) {
            throw new Error("Esta ação já está sendo processada.");
        }

        pendingActionBusyRef.current.add(action.id);
        updatePendingActionEverywhere(action.id, { status: "executing", error: null });

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
                status: update.status || (decision === "execute" ? "completed" : "cancelled"),
                result_label:
                    update.result_label == null
                        ? decision === "execute"
                            ? "Concluída"
                            : "Cancelada"
                        : String(update.result_label),
                executed_at: update.executed_at == null ? nowIso() : String(update.executed_at),
                error: null,
            });

            return String(
                json.reply || (decision === "execute" ? "Ação concluída com sucesso." : "Ação cancelada."),
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
        if (loadingRef.current) return;

        setError("");
        setInput("");

        if (commandText?.trim()) {
            appendMessage({
                id: makeId("user-action"),
                role: "user",
                content: commandText.trim(),
                createdAt: nowIso(),
                streaming: false,
            });
        }

        loadingRef.current = true;
        setLoading(true);

        try {
            const reply = await callPendingAction(action, decision);
            appendMessage({
                id: makeId("assistant-action"),
                role: "assistant",
                content: reply,
                createdAt: nowIso(),
                toolsUsed: [],
                streaming: false,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Falha ao processar a ação.");
        } finally {
            loadingRef.current = false;
            setLoading(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
    }

    async function sendMessage(rawText?: string) {
        const text = String(rawText ?? input).trim();
        if (!text || loadingRef.current) return;

        const pending = latestPendingAction();
        if (pending && isExplicitConfirmCommand(text)) {
            await runPendingActionFromText(pending, "execute", text);
            return;
        }
        if (pending && isExplicitCancelCommand(text)) {
            await runPendingActionFromText(pending, "cancel", text);
            return;
        }

        setError("");
        setInput("");

        const userMessage: ChatMessage = {
            id: makeId("user"),
            role: "user",
            content: text,
            createdAt: nowIso(),
        };
        const assistantId = makeId("assistant");
        const assistantPlaceholder: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: nowIso(),
            toolsUsed: [],
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
                if (response.status === 401 || json?.need_login) {
                    throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
                }
                throw new Error(json?.msg || `Falha na consulta (HTTP ${response.status}).`);
            }

            await consumeSse(response, ({ event, data }) => {
                if (event === "delta") {
                    const delta = String(data?.text || "");
                    if (!delta) return;
                    finalText += delta;
                    updateMessage(assistantId, (m) => ({ ...m, content: finalText }));
                    return;
                }

                if (event === "meta" || event === "done") {
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
                    return;
                }

                if (event === "error") {
                    streamError = String(data?.msg || "Falha na resposta em streaming.");
                    throw new Error(streamError);
                }
            });

            if (!finalText.trim()) throw new Error(streamError || "A Aurora não retornou uma resposta.");

            updateMessage(assistantId, () => ({
                id: assistantId,
                role: "assistant",
                content: finalText,
                createdAt: assistantPlaceholder.createdAt,
                toolsUsed: finalTools,
                productCards: finalProductCards,
                productSuggestions: finalProductSuggestions,
                exportCards: finalExportCards,
                pendingActions: finalPendingActions,
                streaming: false,
            }));
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

    function clearChat() {
        if (loading) return;
        abortRef.current?.abort();
        commitMessages([]);
        setInput("");
        setError("");
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Sem impacto funcional.
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
                            <p className="truncate text-xs text-slate-500">Assistente Administrativo • texto em streaming</p>
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
                    <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-400">Carregando chat...</div>
                ) : messages.length === 0 ? (
                    <EmptyState onPrompt={(prompt) => void sendMessage(prompt)} />
                ) : (
                    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 py-6 sm:py-8">
                        {messages.map((message) => {
                            const isUser = message.role === "user";
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
                                                        disabled={loading}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                </>
                                            ) : (message.productCards?.length || message.productSuggestions?.length || message.exportCards?.length || message.pendingActions?.length) ? (
                                                <>
                                                    <ProductCards products={message.productCards} />
                                                    <ExportCards cards={message.exportCards} />
                                                    <PendingActionCards
                                                        actions={message.pendingActions}
                                                        disabled={loading}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading}
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

                                        {!isUser && message.toolsUsed?.length ? (
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {message.toolsUsed.map((tool) => (
                                                    <span key={`${message.id}-${tool}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                                                        {toolLabel(tool)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}

                        {loading && !messages.some((m) => m.streaming && m.role === "assistant") ? (
                            <TypingIndicator label="Consultando dados" />
                        ) : null}

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
                                placeholder={loading ? "Recebendo resposta..." : "Pergunte à Aurora..."}
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

                    <div className="mt-2 text-center text-[10px] text-slate-400 sm:text-xs">
                        Ações de escrita só são executadas após confirmação explícita. Consultas e arquivos permanecem controlados pelo backend.
                    </div>
                </div>
            </div>
        </div>
    );
}
