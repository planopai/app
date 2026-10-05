"use client";

// Esta página usa variantes dark e tokens semânticos do tema global.

import React, {
    FormEvent,
    KeyboardEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { IconeAurora } from "@/components/shell/IconeAurora";
const CHAT_API = "https://api.planoassistencialintegrado.com.br/chatpai.php";
const TELEMETRIA_URL = "https://api.planoassistencialintegrado.com.br/telemetria.php";
const STORAGE_KEY = "pai-aurora-v4-editing";
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

type ChatAttachment = {
    token: string;
    name: string;
    mime: string;
    size: number;
    kind: "image" | "pdf" | "file";
    preview_url?: string | null;
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

type PendingActionKind = "novo_atendimento" | "requisicao_material" | "atendimento_fase" | "editar_atendimento" | "module_action";
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

type OperationalAttendanceChoice = {
    id: number;
    falecido: string;
    status: string;
    status_label: string;
    next_phase?: string | null;
    next_label?: string | null;
};

type VehicleOption = {
    id: string;
    nome: string;
    placa?: string | null;
    label: string;
    rastreado?: boolean;
};

type OperationalFlowCard = {
    id: string;
    kind: "attendance_list" | "next_action";
    title: string;
    description?: string | null;
    attendances?: OperationalAttendanceChoice[];
    attendance?: OperationalAttendanceChoice | null;
    action?: {
        phase: string;
        label: string;
        description?: string | null;
        executable: boolean;
        requires?: string[];
        vehicle_required?: boolean;
        vehicles?: VehicleOption[];
        command?: string | null;
        external_url?: string | null;
    } | null;
};

type TelemetryStart = {
    attendance_id: number;
    falecido?: string | null;
    phase: string;
    type: "remocao" | "para_velorio" | "para_sepultamento";
    vehicle_id: string;
    vehicle_name: string;
    vehicle_plate?: string | null;
    vehicle_label: string;
    started_at?: string | null;
};

type OperationalExecutionResult = {
    kind?: string;
    id?: number | null;
    fase?: string | null;
};

type AttendanceEditField = {
    key: string;
    label: string;
    type: "text" | "textarea" | "date" | "time" | "select";
    required: boolean;
    value?: string;
    options?: string[];
};

type AttendanceEditSummary = {
    key: string;
    label: string;
    value: string;
};

type AttendanceEditForm = {
    id: string;
    attendance_id: number;
    falecido: string;
    title: string;
    summary: AttendanceEditSummary[];
    fields: AttendanceEditField[];
    base_changes: Record<string, unknown>;
};

type KnowledgeSource = {
    documento_id: number;
    titulo: string;
    departamento?: string | null;
    natureza?: string | null;
    versao?: number | null;
    alerta_pendente?: boolean;
    paginas?: string | null;
    trechos?: number | null;
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
    operationalFlows?: OperationalFlowCard[];
    editForms?: AttendanceEditForm[];
    knowledgeSources?: KnowledgeSource[];
    attachment?: ChatAttachment | null;
    /** Conteúdo enviado à API. Pode incluir metadados internos do anexo sem poluir a bolha do usuário. */
    apiContent?: string;
};

type SseEvent = {
    event: string;
    data: any;
};

const QUICK_PROMPTS = [
    "Quero realizar uma ação em um atendimento",
    "Quantos atendimentos estamos tendo agora?",
    "Quais são os horários dos sepultamentos de hoje?",
    "Onde estão sendo realizados os velórios de hoje?",
    "Quero criar um novo atendimento",
    "Quero solicitar materiais",
    "Quero consultar um produto no estoque",
    "Quantas coroas de flores estão sendo confeccionadas?",
    "Quero criar um pedido de coroa de flores",
];

const TOOL_LABELS: Record<string, string> = {
    gerenciar_acao_atendimento: "Ação em atendimento",
    preparar_novo_atendimento: "Novo atendimento",
    preparar_edicao_atendimento: "Editar atendimento",
    preparar_requisicao_material: "Requisição",
    consultar_atendimentos: "Atendimentos",
    detalhar_atendimento: "Atendimentos",
    consultar_estoque: "Estoque",
    consultar_produto_estoque: "Estoque",
    consultar_movimentacoes: "Movimentações",
    consultar_requisicoes: "Requisições",
    consultar_coroas: "Coroas",
    preparar_acao_modulo: "Ação administrativa",
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

function sanitizeKnowledgeSources(value: unknown): KnowledgeSource[] {
    if (!Array.isArray(value)) return [];
    const out: KnowledgeSource[] = [];
    const seen = new Set<number>();

    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const id = Number(item.documento_id || item.id || 0);
        const title = String(item.titulo || "").trim();
        if (!Number.isFinite(id) || id <= 0 || !title || seen.has(id)) continue;
        seen.add(id);

        out.push({
            documento_id: id,
            titulo: title,
            departamento: item.departamento == null ? null : String(item.departamento),
            natureza: item.natureza == null ? null : String(item.natureza),
            versao: item.versao == null ? null : Number(item.versao),
            alerta_pendente: Boolean(item.alerta_pendente),
            paginas: item.paginas == null ? null : String(item.paginas),
            trechos: item.trechos == null ? null : Number(item.trechos),
        });
    }

    return out;
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

function sanitizeAttachment(value: unknown): ChatAttachment | null {
    if (!value || typeof value !== "object") return null;
    const item = value as any;
    const token = String(item.token || "").trim();
    const name = String(item.name || "arquivo").trim();
    const mime = String(item.mime || "application/octet-stream").trim();
    const size = Number(item.size || 0);
    const rawKind = String(item.kind || "").toLowerCase();
    const kind: ChatAttachment["kind"] =
        rawKind === "image" ? "image" : rawKind === "pdf" ? "pdf" : "file";
    if (!token || !name) return null;
    return {
        token,
        name,
        mime,
        size: Number.isFinite(size) && size > 0 ? size : 0,
        kind,
        preview_url: item.preview_url == null ? null : String(item.preview_url),
    };
}

function attachmentApiContext(attachment: ChatAttachment) {
    const visualFlag = attachment.kind === "image" ? ' visual="1"' : "";
    return `[ANEXO_AURORA token="${attachment.token}" nome="${attachment.name.replaceAll('"', "")}" mime="${attachment.mime}" tipo="${attachment.kind}"${visualFlag}]`;
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
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB]/70 dark:bg-[#232B3F]/70">
            {current?.foto_url ? (
                <a href={current.foto_url} target="_blank" rel="noreferrer" className="block bg-white dark:bg-[#232B3F]">
                    <img
                        src={current.foto_url}
                        alt={current.legenda || product.produto_nome}
                        className="max-h-[360px] w-full object-contain p-2"
                        loading="lazy"
                    />
                </a>
            ) : null}

            {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto border-t border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-2">
                    {photos.slice(0, 8).map((photo, index) => (
                        <button
                            key={`${product.produto_id}-photo-${photo.id ?? index}`}
                            type="button"
                            onClick={() => setActive(index)}
                            className={[
                                "h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white dark:bg-[#232B3F]",
                                index === active ? "border-[#00AEEC] dark:border-[#00AEEC] ring-2 ring-[#00AEEC]/20 dark:ring-[#00AEEC]/30" : "border-[#E3E8F0] dark:border-white/[0.12]",
                            ].join(" ")}
                            title={photo.legenda || `Foto ${index + 1}`}
                        >
                            <img src={photo.foto_url || ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="space-y-2 p-3 text-left">
                <div className="font-semibold text-[#313C55] dark:text-white">{product.produto_nome}</div>
                {price ? <div className="text-base font-semibold text-[#5C7A12] dark:text-[#B3CE52]">{price}</div> : null}
                <div className="flex flex-wrap gap-1.5 text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">
                    {product.fabricante ? <span className="rounded-full bg-white dark:bg-[#232B3F] px-2 py-1 ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">{product.fabricante}</span> : null}
                    {product.categoria ? <span className="rounded-full bg-white dark:bg-[#232B3F] px-2 py-1 ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">{product.categoria}</span> : null}
                    {product.classificacao ? <span className="rounded-full bg-white dark:bg-[#232B3F] px-2 py-1 ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">{product.classificacao}</span> : null}
                    <span className="rounded-full bg-white dark:bg-[#232B3F] px-2 py-1 ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">Estoque: {stock.toLocaleString("pt-BR")}</span>
                </div>
                {product.descricao ? <p className="text-xs leading-5 text-[#5B6478] dark:text-[#AEB9CF]">{product.descricao}</p> : null}
                {product.codigo_barras ? <div className="text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">Código: {product.codigo_barras}</div> : null}
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
        <div className="mt-3 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-2.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">Sugestões próximas</div>
            <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 6).map((item) => (
                    <button
                        key={`product-suggestion-${item.produto_id}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChoose(item.produto_nome)}
                        className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-left text-xs text-[#313C55] dark:text-[#D6DCE8] shadow-sm transition hover:border-[#00AEEC] dark:hover:border-[#00AEEC]/60 hover:bg-[#E6F7FE] dark:hover:bg-[#00AEEC]/15 disabled:cursor-not-allowed disabled:opacity-50"
                        title={[item.categoria, item.fabricante].filter(Boolean).join(" • ")}
                    >
                        <span className="block font-semibold text-[#313C55] dark:text-white">{item.produto_nome}</span>
                        {(item.categoria || item.fabricante) ? (
                            <span className="mt-0.5 block text-[10px] text-[#5B6478] dark:text-[#AEB9CF]">
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
                        className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334]"
                    >
                        <div className="flex items-center gap-3 p-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-[#D6DCE8] shadow-sm ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">
                                <span className="text-[11px] font-bold uppercase">{card.format}</span>
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-[#313C55] dark:text-white">
                                    {card.title}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    {exportFormatDescription(card.format)} • {card.filename}
                                </div>
                                {validExpiry ? (
                                    <div className="mt-0.5 text-[10px] text-[#7A8396] dark:text-[#8893AA]">
                                        Link temporário até {expiry!.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                ) : null}
                            </div>

                            <a
                                href={exportDownloadUrl(card)}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#232B40] dark:hover:bg-[#0097CC]"
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
    const allowedKinds = new Set<PendingActionKind>(["novo_atendimento", "requisicao_material", "atendimento_fase", "editar_atendimento", "module_action"]);
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

    const IconClock = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
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
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </svg>
    );

    const IconCheck = ({ className = "h-4 w-4" }: { className?: string }) => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="m5 12 4 4L19 6" />
        </svg>
    );

    const IconX = ({ className = "h-4 w-4" }: { className?: string }) => (
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
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    );

    const IconPackage = ({ className = "h-5 w-5" }: { className?: string }) => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
            <path d="m4.5 7.7 7.5 4.2 7.5-4.2" />
            <path d="M12 12v9" />
        </svg>
    );

    const IconTag = ({ className = "h-4 w-4" }: { className?: string }) => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M20 13 13 20 4 11V4h7l9 9Z" />
            <circle cx="8.5" cy="8.5" r="1" />
        </svg>
    );

    const IconBuilding = ({ className = "h-4 w-4" }: { className?: string }) => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M3 21h18" />
            <path d="M5 21V10h14v11" />
            <path d="m4 10 8-5 8 5" />
            <path d="M9 14v3M15 14v3" />
        </svg>
    );

    const labelIsItem = (label: string) => {
        const q = normalizeCommandText(label);
        return q === "material" || /^item\s+\d+$/.test(q);
    };

    return (
        <div className="mt-3 space-y-3">
            {actions.map((action) => {
                const expiry = action.expires_at ? new Date(action.expires_at) : null;
                const expired = Boolean(
                    expiry &&
                    !Number.isNaN(expiry.getTime()) &&
                    expiry.getTime() < Date.now()
                );

                const pending = action.status === "pending" || action.status === "error";
                const executing = action.status === "executing";
                const completed = action.status === "completed";
                const cancelled = action.status === "cancelled";
                const isRequest = action.kind === "requisicao_material";

                const itemDetails = isRequest
                    ? action.details.filter((detail) => labelIsItem(detail.label))
                    : [];

                const metaDetails = isRequest
                    ? action.details.filter((detail) => !labelIsItem(detail.label))
                    : action.details;

                const classification = metaDetails.find(
                    (detail) => normalizeCommandText(detail.label) === "classificacao"
                );

                const destination = metaDetails.find(
                    (detail) => normalizeCommandText(detail.label) === "destino"
                );

                const requestType = metaDetails.find(
                    (detail) => normalizeCommandText(detail.label) === "tipo da requisicao"
                );

                const titleText =
                    isRequest && requestType?.value
                        ? requestType.value
                        : action.title;

                return (
                    <div
                        key={action.id}
                        className={[
                            "overflow-hidden rounded-2xl border shadow-sm",
                            completed
                                ? "border-[#B3CE52]/60 bg-[#EEF5D6]/70 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15"
                                : cancelled
                                    ? "border-[#E3E8F0] bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#1C2334]"
                                    : action.status === "error"
                                        ? "border-[#F4B8B1] bg-[#FDECEA]/70 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15"
                                        : "border-[#F2CB3F]/70 bg-gradient-to-b from-[#FCF3CC]/85 to-white dark:border-[#F2CB3F]/40 dark:from-[#F2CB3F]/15 dark:to-[#1C2334]",
                        ].join(" ")}
                    >
                        <div className="p-3 sm:p-4">
                            <div className="flex items-start gap-2.5 sm:gap-3">
                                <div
                                    className={[
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                                        completed
                                            ? "bg-[#EEF5D6] text-[#5C7A12] dark:bg-[#B3CE52]/20 dark:text-[#B3CE52]"
                                            : cancelled
                                                ? "bg-[#E3E8F0] text-[#5B6478] dark:bg-white/15 dark:text-[#D6DCE8]"
                                                : action.status === "error"
                                                    ? "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/20 dark:text-[#FF9C92]"
                                                    : "bg-[#FCF3CC] text-[#B45309] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
                                    ].join(" ")}
                                >
                                    {isRequest ? (
                                        <IconPackage />
                                    ) : (
                                        <span className="text-[10px] font-bold">
                                            {action.kind === "novo_atendimento"
                                                ? "ATD"
                                                : action.kind === "atendimento_fase"
                                                    ? "AÇÃO"
                                                    : action.kind === "editar_atendimento"
                                                        ? "EDIT"
                                                        : action.kind === "module_action"
                                                            ? "MOD"
                                                            : "REQ"}
                                        </span>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold leading-tight text-[#313C55] dark:text-white sm:text-sm">
                                        {isRequest ? "Nova requisição" : action.title}
                                    </div>

                                    {isRequest && titleText ? (
                                        <div className="mt-0.5 text-[13px] font-semibold leading-tight text-[#313C55] dark:text-[#E8ECF4] sm:text-sm">
                                            {titleText}
                                        </div>
                                    ) : null}

                                    {/*
                                      Para requisições de material, NÃO exibimos a descrição:
                                      "Esta requisição ficará PENDENTE..."
                                      Isso deixa o card mais limpo no celular.
                                      As demais ações continuam exibindo suas descrições normalmente.
                                    */}
                                    {!isRequest && action.description ? (
                                        <div className="mt-1 text-xs leading-5 text-[#5B6478] dark:text-[#AEB9CF]">
                                            {action.description}
                                        </div>
                                    ) : null}
                                </div>

                                <span
                                    className={[
                                        "inline-flex max-w-[46%] shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold leading-tight sm:max-w-none sm:text-[10px]",
                                        completed
                                            ? "bg-[#EEF5D6] text-[#5C7A12] dark:bg-[#B3CE52]/20 dark:text-[#B3CE52]"
                                            : cancelled
                                                ? "bg-[#E3E8F0] text-[#5B6478] dark:bg-white/15 dark:text-[#D6DCE8]"
                                                : executing
                                                    ? "bg-[#E6F7FE] text-[#0086B8] dark:bg-[#00AEEC]/20 dark:text-[#5CCBF4]"
                                                    : action.status === "error"
                                                        ? "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/20 dark:text-[#FF9C92]"
                                                        : "bg-[#FCF3CC] text-[#7A5600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
                                    ].join(" ")}
                                >
                                    {!completed && !cancelled && !executing && action.status !== "error" ? (
                                        <IconClock className="h-3 w-3 shrink-0" />
                                    ) : null}

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

                            {isRequest ? (
                                <div className="mt-3 overflow-hidden rounded-xl border border-[#E3E8F0]/90 bg-white/90 dark:border-white/[0.12] dark:bg-[#232B3F]/85">
                                    {itemDetails.length ? (
                                        <div className="divide-y divide-[#EEF2F7] dark:divide-white/[0.08]">
                                            {itemDetails.map((detail, index) => {
                                                const match = detail.value.match(
                                                    /^\s*([0-9.,]+)\s*[×xX]\s*(.+?)\s*$/
                                                );

                                                const quantity = match?.[1]?.trim() || "";
                                                const product = match?.[2]?.trim() || detail.value;

                                                return (
                                                    <div
                                                        key={`${action.id}-item-${index}`}
                                                        className="flex items-center gap-3 px-3 py-2.5"
                                                    >
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] text-[#5B6478] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-[#D6DCE8]">
                                                            <IconPackage className="h-4 w-4" />
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-xs font-semibold text-[#313C55] dark:text-white sm:text-[13px]">
                                                                {product}
                                                            </div>
                                                        </div>

                                                        {quantity ? (
                                                            <div className="shrink-0 text-xs font-semibold text-[#313C55] dark:text-white">
                                                                {quantity} un
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {(classification || destination) ? (
                                        <div className="grid grid-cols-1 gap-2 border-t border-[#EEF2F7] px-3 py-2.5 dark:border-white/[0.08] min-[420px]:grid-cols-2">
                                            {classification ? (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <IconTag className="mt-0.5 h-4 w-4 shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                                                    <div className="min-w-0">
                                                        <div className="text-[9px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                            Classificação
                                                        </div>
                                                        <div className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-[#313C55] dark:text-[#E8ECF4]">
                                                            {classification?.value}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null}

                                            {destination ? (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <IconBuilding className="mt-0.5 h-4 w-4 shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                                                    <div className="min-w-0">
                                                        <div className="text-[9px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                            Destino
                                                        </div>
                                                        <div className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-[#313C55] dark:text-[#E8ECF4]">
                                                            {destination?.value}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : metaDetails.length ? (
                                <div className="mt-3 grid gap-1.5 rounded-xl bg-white/80 p-3 ring-1 ring-inset ring-[#E3E8F0]/70 dark:bg-[#232B3F]/80 dark:ring-white/[0.12]">
                                    {metaDetails.map((detail, index) => (
                                        <div
                                            key={`${action.id}-detail-${index}`}
                                            className="grid grid-cols-[minmax(90px,0.42fr)_1fr] gap-3 text-xs"
                                        >
                                            <span className="text-[#5B6478] dark:text-[#AEB9CF]">
                                                {detail.label}
                                            </span>
                                            <span className="break-words font-medium text-[#313C55] dark:text-[#E8ECF4]">
                                                {detail.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {action.result_label ? (
                                <div className="mt-3 text-xs font-semibold text-[#5C7A12] dark:text-[#B3CE52]">
                                    {action.result_label}
                                </div>
                            ) : null}

                            {action.error ? (
                                <div className="mt-3 rounded-xl border border-[#F4B8B1] bg-[#FDECEA] px-3 py-2 text-xs text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                                    {action.error}
                                </div>
                            ) : null}

                            {pending && !expired ? (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={disabled || executing}
                                        onClick={() => onConfirm(action)}
                                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#B3CE52] px-3 py-2 text-xs font-semibold text-[#313C55] shadow-sm transition hover:bg-[#A3BE45] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <IconCheck />
                                        <span>
                                            {action.status === "error"
                                                ? "Tentar novamente"
                                                : (action.confirm_label ||
                                                    (isRequest ? "Criar requisição" : "Confirmar"))}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={disabled || executing}
                                        onClick={() => onCancel(action)}
                                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#C9D1DE] bg-white px-3 py-2 text-xs font-semibold text-[#313C55] shadow-sm transition hover:bg-[#EEF2F7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-white/10"
                                    >
                                        <IconX />
                                        <span>Cancelar</span>
                                    </button>
                                </div>
                            ) : null}

                            {expired && pending ? (
                                <div className="mt-3 text-xs text-[#7A5600] dark:text-[#F2CB3F]">
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


function sanitizeEditForms(value: unknown): AttendanceEditForm[] {
    if (!Array.isArray(value)) return [];
    const out: AttendanceEditForm[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const id = String(item.id || "").trim();
        const attendanceId = Number(item.attendance_id || 0);
        if (!id || attendanceId <= 0) continue;
        const fields: AttendanceEditField[] = Array.isArray(item.fields)
            ? item.fields.map((field: any) => ({
                key: String(field?.key || "").trim(),
                label: String(field?.label || field?.key || "").trim(),
                type: (["text", "textarea", "date", "time", "select"].includes(String(field?.type)) ? String(field.type) : "text") as AttendanceEditField["type"],
                required: Boolean(field?.required),
                value: field?.value == null ? "" : String(field.value),
                options: Array.isArray(field?.options) ? field.options.map(String).filter(Boolean) : [],
            })).filter((field: AttendanceEditField) => field.key && field.label)
            : [];
        const summary: AttendanceEditSummary[] = Array.isArray(item.summary)
            ? item.summary.map((s: any) => ({ key: String(s?.key || ""), label: String(s?.label || ""), value: String(s?.value ?? "") })).filter((s: AttendanceEditSummary) => s.key && s.label)
            : [];
        out.push({
            id,
            attendance_id: attendanceId,
            falecido: String(item.falecido || "").trim(),
            title: String(item.title || "Completar dados da alteração").trim(),
            summary,
            fields,
            base_changes: item.base_changes && typeof item.base_changes === "object" ? item.base_changes : {},
        });
    }
    return out.slice(0, 3);
}

function AttendanceEditFormCard({
    form,
    disabled,
    onSubmit,
}: {
    form: AttendanceEditForm;
    disabled?: boolean;
    onSubmit: (form: AttendanceEditForm, values: Record<string, unknown>) => Promise<void> | void;
}) {
    const initial = useMemo(() => {
        const base: Record<string, string> = {};
        for (const field of form.fields) base[field.key] = field.value || "";
        return base;
    }, [form.id, form.fields]);
    const [values, setValues] = useState<Record<string, string>>(initial);
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState("");

    useEffect(() => {
        setValues(initial);
        setLocalError("");
        setBusy(false);
    }, [form.id, initial]);

    async function submit() {
        if (busy || disabled) return;
        for (const field of form.fields) {
            if (field.required && !String(values[field.key] || "").trim()) {
                setLocalError(`Informe ${field.label.toLowerCase()}.`);
                return;
            }
        }
        setLocalError("");
        setBusy(true);
        try {
            await onSubmit(form, { ...form.base_changes, ...values });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#8FD6F4] dark:border-[#00AEEC]/40 bg-[#E6F7FE]/50 dark:bg-[#00AEEC]/10">
            <div className="p-4">
                <div className="text-sm font-semibold text-[#313C55] dark:text-white">{form.title}</div>
                <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{form.falecido || `Atendimento #${form.attendance_id}`}</div>

                {form.summary.length ? (
                    <div className="mt-3 grid gap-1.5 rounded-xl bg-white dark:bg-[#232B3F] p-3 ring-1 ring-[#E3E8F0] dark:ring-white/[0.12]">
                        {form.summary.map((item) => (
                            <div key={`${form.id}-summary-${item.key}`} className="grid grid-cols-[minmax(110px,0.45fr)_1fr] gap-3 text-xs">
                                <span className="text-[#5B6478] dark:text-[#AEB9CF]">{item.label}</span>
                                <span className="font-medium text-[#313C55] dark:text-[#E8ECF4]">{item.value || "Não informado"}</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <div className="mt-3 grid gap-3">
                    {form.fields.map((field) => (
                        <label key={`${form.id}-${field.key}`} className="block">
                            <span className="mb-1 block text-xs font-medium text-[#313C55] dark:text-[#D6DCE8]">
                                {field.label}{field.required ? " *" : ""}
                            </span>
                            {field.type === "textarea" ? (
                                <textarea
                                    value={values[field.key] || ""}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    disabled={disabled || busy}
                                    rows={3}
                                    className="w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-[16px] text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/20 dark:focus:ring-[#00AEEC]/30 disabled:opacity-60 sm:text-sm"
                                />
                            ) : field.type === "select" ? (
                                <select
                                    value={values[field.key] || ""}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    disabled={disabled || busy}
                                    className="w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-[16px] text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/20 dark:focus:ring-[#00AEEC]/30 disabled:opacity-60 sm:text-sm"
                                >
                                    <option value="">Selecione</option>
                                    {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            ) : (
                                <input
                                    type={field.type}
                                    value={values[field.key] || ""}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    disabled={disabled || busy}
                                    className="w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-[16px] text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/20 dark:focus:ring-[#00AEEC]/30 disabled:opacity-60 sm:text-sm"
                                />
                            )}
                        </label>
                    ))}
                </div>

                {localError ? <div className="mt-3 text-xs font-medium text-[#B42318] dark:text-[#FF9C92]">{localError}</div> : null}

                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={disabled || busy}
                    className="mt-4 w-full rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#232B40] dark:hover:bg-[#0097CC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? "Preparando..." : "Revisar alterações"}
                </button>
            </div>
        </div>
    );
}

function AttendanceEditForms({
    forms,
    disabled,
    onSubmit,
}: {
    forms?: AttendanceEditForm[];
    disabled?: boolean;
    onSubmit: (form: AttendanceEditForm, values: Record<string, unknown>) => Promise<void> | void;
}) {
    if (!forms?.length) return null;
    return <div className="mt-3 space-y-3">{forms.map((form) => <AttendanceEditFormCard key={form.id} form={form} disabled={disabled} onSubmit={onSubmit} />)}</div>;
}

function sanitizeOperationalFlows(value: unknown): OperationalFlowCard[] {
    if (!Array.isArray(value)) return [];
    const out: OperationalFlowCard[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as any;
        const kind = String(item.kind || "");
        if (kind !== "attendance_list" && kind !== "next_action") continue;

        const title = String(item.title || "").trim();
        if (!title) continue;

        const attendances: OperationalAttendanceChoice[] = Array.isArray(item.attendances)
            ? item.attendances
                .map((row: any) => ({
                    id: Number(row?.id || 0),
                    falecido: String(row?.falecido || "").trim(),
                    status: String(row?.status || "").trim(),
                    status_label: String(row?.status_label || row?.status || "").trim(),
                    next_phase: row?.next_phase == null ? null : String(row.next_phase),
                    next_label: row?.next_label == null ? null : String(row.next_label),
                }))
                .filter((row: OperationalAttendanceChoice) => row.id > 0 && row.falecido)
                .slice(0, 40)
            : [];

        const attendanceRaw = item.attendance && typeof item.attendance === "object" ? item.attendance : null;
        const attendance: OperationalAttendanceChoice | null = attendanceRaw
            ? {
                id: Number(attendanceRaw.id || 0),
                falecido: String(attendanceRaw.falecido || "").trim(),
                status: String(attendanceRaw.status || "").trim(),
                status_label: String(attendanceRaw.status_label || attendanceRaw.status || "").trim(),
                next_phase: attendanceRaw.next_phase == null ? null : String(attendanceRaw.next_phase),
                next_label: attendanceRaw.next_label == null ? null : String(attendanceRaw.next_label),
            }
            : null;

        const actionRaw = item.action && typeof item.action === "object" ? item.action : null;
        const action = actionRaw
            ? {
                phase: String(actionRaw.phase || "").trim(),
                label: String(actionRaw.label || "").trim(),
                description: actionRaw.description == null ? null : String(actionRaw.description),
                executable: Boolean(actionRaw.executable),
                requires: Array.isArray(actionRaw.requires) ? actionRaw.requires.map(String).filter(Boolean) : [],
                vehicle_required: Boolean(actionRaw.vehicle_required),
                vehicles: Array.isArray(actionRaw.vehicles)
                    ? actionRaw.vehicles
                        .map((vehicle: any) => ({
                            id: String(vehicle?.id || "").trim(),
                            nome: String(vehicle?.nome || "").trim(),
                            placa: vehicle?.placa == null ? null : String(vehicle.placa).trim(),
                            label: String(vehicle?.label || vehicle?.nome || "").trim(),
                            rastreado: Boolean(vehicle?.rastreado),
                        }))
                        .filter((vehicle: VehicleOption) => vehicle.id && vehicle.nome && vehicle.label)
                    : [],
                command: actionRaw.command == null ? null : String(actionRaw.command),
                external_url: actionRaw.external_url == null ? null : String(actionRaw.external_url),
            }
            : null;

        out.push({
            id: String(item.id || `op-${kind}-${out.length}`),
            kind,
            title,
            description: item.description == null ? null : String(item.description),
            attendances,
            attendance: attendance && attendance.id > 0 ? attendance : null,
            action,
        });
    }

    return out.slice(0, 4);
}

function OperationalFlowCards({
    flows,
    disabled,
    onChooseAttendance,
    onChooseAction,
    onChooseVehicleAction,
}: {
    flows?: OperationalFlowCard[];
    disabled?: boolean;
    onChooseAttendance: (choice: OperationalAttendanceChoice) => void;
    onChooseAction: (flow: OperationalFlowCard) => void;
    onChooseVehicleAction: (flow: OperationalFlowCard, vehicle: VehicleOption) => Promise<void> | void;
}) {
    const [vehicleFlowId, setVehicleFlowId] = useState<string | null>(null);
    const [vehicleBusyId, setVehicleBusyId] = useState<string | null>(null);

    if (!flows?.length) return null;

    return (
        <div className="mt-3 space-y-3">
            {flows.map((flow) => {
                if (flow.kind === "attendance_list") {
                    return (
                        <div key={flow.id} className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]">
                            <div className="p-3.5">
                                <div className="text-sm font-semibold text-[#313C55] dark:text-white">{flow.title || "Escolha o atendimento"}</div>
                                <div className="mt-3 grid gap-2">
                                    {(flow.attendances || []).map((choice) => (
                                        <button
                                            key={`${flow.id}-${choice.id}`}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onChooseAttendance(choice)}
                                            className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] px-3 py-2.5 text-left transition hover:border-[#00AEEC] dark:hover:border-[#00AEEC]/60 hover:bg-[#E6F7FE] dark:hover:bg-[#00AEEC]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <div className="text-sm font-semibold text-[#313C55] dark:text-white">{choice.falecido}</div>
                                            <div className="mt-0.5 text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">{choice.status_label || "Aguardando"}</div>
                                        </button>
                                    ))}
                                    {!(flow.attendances || []).length ? (
                                        <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Nenhum atendimento ativo.</div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                }

                if (!flow.attendance) return null;
                const action = flow.action;
                const vehicleOpen = vehicleFlowId === flow.id;

                return (
                    <div key={flow.id} className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]">
                        <div className="p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[#313C55] dark:text-white">{flow.attendance.falecido}</div>
                                    <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{flow.attendance.status_label || "Aguardando"}</div>
                                </div>
                            </div>

                            {action ? (
                                <div className="mt-3">
                                    {action.vehicle_required ? (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => setVehicleFlowId(vehicleOpen ? null : flow.id)}
                                            className="w-full rounded-xl bg-[#F2CB3F] px-4 py-3 text-left text-sm font-semibold text-[#313C55] shadow-sm transition hover:bg-[#E4BC30] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {action.label}
                                        </button>
                                    ) : action.executable && action.command ? (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onChooseAction(flow)}
                                            className="w-full rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-[#232B40] dark:hover:bg-[#0097CC] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {action.label}
                                        </button>
                                    ) : action.external_url ? (
                                        <a
                                            href={action.external_url}
                                            className="block w-full rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-[#232B40] dark:hover:bg-[#0097CC]"
                                        >
                                            {action.label}
                                        </a>
                                    ) : (
                                        <div className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] px-4 py-3 text-sm font-semibold text-[#313C55] dark:text-[#D6DCE8]">
                                            {action.label}
                                        </div>
                                    )}

                                    {action.vehicle_required && vehicleOpen ? (
                                        <div className="mt-3 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                                            <div className="mb-2 text-xs font-semibold text-[#313C55] dark:text-[#D6DCE8]">Escolha o veículo</div>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {(action.vehicles || []).map((vehicle) => (
                                                    <button
                                                        key={`${flow.id}-${vehicle.id}`}
                                                        type="button"
                                                        disabled={disabled || vehicleBusyId !== null}
                                                        onClick={async () => {
                                                            setVehicleBusyId(vehicle.id);
                                                            try {
                                                                await onChooseVehicleAction(flow, vehicle);
                                                                setVehicleFlowId(null);
                                                            } finally {
                                                                setVehicleBusyId(null);
                                                            }
                                                        }}
                                                        className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-left text-xs font-semibold text-[#313C55] dark:text-[#E8ECF4] transition hover:border-[#00AEEC] dark:hover:border-[#00AEEC]/60 hover:bg-[#E6F7FE] dark:hover:bg-[#00AEEC]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {vehicleBusyId === vehicle.id ? "Preparando..." : vehicle.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="mt-3 text-xs font-medium text-[#5C7A12] dark:text-[#B3CE52]">Fluxo concluído.</div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

type TelemetryQueueItem = { when: number; url: string; body: any };

const TELEMETRY_ACTIVE_KEY = "tele_active_snapshot";
const TELEMETRY_QUEUE_KEY = "telemetria_offline_queue";
const TELEMETRY_STOP_BY_START: Record<string, string> = {
    fase01: "fase02",
    fase07: "fase08",
    fase09: "fase10",
};

function normalizePlate(value?: string | null) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function toMysqlDateTime(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function readTelemetrySnapshot(): any | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(TELEMETRY_ACTIVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function saveTelemetrySnapshot(start: TelemetryStart) {
    if (typeof window === "undefined") return;
    const plate = normalizePlate(start.vehicle_plate || "");
    const parsedStart = start.started_at ? Date.parse(start.started_at) : NaN;
    const startTs = Number.isFinite(parsedStart) ? parsedStart : Date.now();
    window.localStorage.setItem(TELEMETRY_ACTIVE_KEY, JSON.stringify({
        id: String(start.attendance_id),
        sepultamento_id: String(start.attendance_id),
        fase: start.phase,
        tipo: start.type,
        veiculo: start.vehicle_label,
        veiculo_nome: start.vehicle_name,
        falecido: start.falecido || null,
        placa: plate || null,
        startTs,
        origem_dados: plate ? "itrack" : "manual_sem_rota",
        source_device: plate ? "rastreador" : "sem_rastreador",
    }));
}

function clearTelemetrySnapshot() {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(TELEMETRY_ACTIVE_KEY); } catch { }
}

function readTelemetryQueue(): TelemetryQueueItem[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(TELEMETRY_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeTelemetryQueue(items: TelemetryQueueItem[]) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(items)); } catch { }
}

function enqueueTelemetry(body: any) {
    const queue = readTelemetryQueue();
    queue.push({ when: Date.now(), url: TELEMETRIA_URL, body });
    writeTelemetryQueue(queue);
}

async function postTelemetry(body: any) {
    const response = await fetch(TELEMETRIA_URL, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.sucesso) {
        throw new Error(String(json?.msg || json?.erro || "Falha ao salvar telemetria."));
    }
    return json;
}

async function flushTelemetryQueue() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = readTelemetryQueue();
    if (!queue.length) return;
    const remaining: TelemetryQueueItem[] = [];
    for (const item of queue) {
        try {
            await postTelemetry(item.body);
        } catch {
            remaining.push(item);
        }
    }
    writeTelemetryQueue(remaining);
}

async function finishTelemetryIfNeeded(result?: OperationalExecutionResult | null) {
    if (!result || result.kind !== "atendimento_fase" || !result.id || !result.fase) return false;
    const snapshot = readTelemetrySnapshot();
    if (!snapshot) return false;

    const snapshotId = String(snapshot.id ?? snapshot.sepultamento_id ?? "");
    if (snapshotId !== String(result.id)) return false;
    const expectedStop = TELEMETRY_STOP_BY_START[String(snapshot.fase || "")];
    if (!expectedStop || expectedStop !== String(result.fase)) return false;

    const startTs = Number(snapshot.startTs || 0) || Date.now();
    const endTs = Date.now();
    const duration = Math.max(1, Math.round((endTs - startTs) / 1000));
    const plate = normalizePlate(snapshot.placa || "");
    const base = {
        sepultamento_id: String(result.id),
        tipo: snapshot.tipo || null,
        falecido: snapshot.falecido || null,
        veiculo_nome: snapshot.veiculo_nome || snapshot.veiculo || null,
        placa: plate || null,
        veiculo_obs: plate ? null : "OUTRA EMPRESA / sem rastreador",
        inicio_ts: toMysqlDateTime(new Date(startTs)),
        fim_ts: toMysqlDateTime(new Date(endTs)),
        duracao_seg: duration,
        encerrado: 1,
    };
    const body = plate
        ? { acao: "inserir_itrack", ...base, source_device: "rastreador", origem_dados: "itrack" }
        : {
            acao: "inserir",
            ...base,
            distancia_km: 0,
            vel_media_kmh: 0,
            vel_max_kmh: 0,
            velocidade_media: 0,
            velocidade_max: 0,
            amostras: 0,
            pontos_json: [],
            source_device: "sem_rastreador",
            origem_dados: "manual_sem_rota",
            observacao: "Veículo de outra empresa ou sem placa/rastreador. Registro salvo sem rota.",
        };

    try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
        await postTelemetry(body);
    } catch {
        enqueueTelemetry(body);
    } finally {
        clearTelemetrySnapshot();
    }
    return true;
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
                operationalFlows: sanitizeOperationalFlows(item.operationalFlows),
                editForms: sanitizeEditForms(item.editForms),
                knowledgeSources: sanitizeKnowledgeSources(item.knowledgeSources),
                attachment: sanitizeAttachment(item.attachment),
                apiContent: typeof item.apiContent === "string" ? item.apiContent : undefined,
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
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<]+)/g).filter(Boolean);

    return parts.map((part, index) => {
        const key = `${keyPrefix}-${index}`;

        if (/^https?:\/\//i.test(part)) {
            const cleanUrl = part.replace(/[),.;!?]+$/, "");
            const suffix = part.slice(cleanUrl.length);

            return (
                <React.Fragment key={key}>
                    <a
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-semibold text-[#0086B8] dark:text-[#5CCBF4] underline decoration-[#8FD6F4] underline-offset-2 hover:text-[#0086B8] dark:hover:text-[#5CCBF4]"
                    >
                        Abrir link de pagamento
                    </a>
                    {suffix}
                </React.Fragment>
            );
        }

        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
                <strong key={key} className="font-semibold text-[#313C55] dark:text-white">
                    {part.slice(2, -2)}
                </strong>
            );
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return (
                <code key={key} className="rounded bg-[#EEF2F7] dark:bg-[#1C2334] px-1 py-0.5 font-mono text-[0.9em] text-[#313C55] dark:text-[#D6DCE8]">
                    {part.slice(1, -1)}
                </code>
            );
        }

        return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

function parseMarkdownTableRow(line: string): string[] {
    let value = String(line || "").trim();
    if (value.startsWith("|")) value = value.slice(1);
    if (value.endsWith("|")) value = value.slice(0, -1);

    const cells: string[] = [];
    let current = "";
    let escaped = false;

    for (const char of value) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            current += char;
            continue;
        }
        if (char === "|") {
            cells.push(current.trim().replace(/\\\|/g, "|"));
            current = "";
            continue;
        }
        current += char;
    }
    cells.push(current.trim().replace(/\\\|/g, "|"));
    return cells;
}

function isMarkdownTableSeparator(line: string) {
    const cells = parseMarkdownTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function markdownTableAlignments(separatorLine: string): Array<"left" | "center" | "right"> {
    return parseMarkdownTableRow(separatorLine).map((cell) => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
        if (trimmed.endsWith(":")) return "right";
        return "left";
    });
}

function AssistantContent({ content }: { content: string }) {
    const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
    const blocks: React.ReactNode[] = [];

    for (let index = 0; index < lines.length;) {
        const rawLine = lines[index] ?? "";
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        // Tabela Markdown: cabeçalho | separador | linhas de dados.
        if (
            trimmed.includes("|")
            && index + 1 < lines.length
            && isMarkdownTableSeparator(lines[index + 1] ?? "")
        ) {
            const headers = parseMarkdownTableRow(trimmed);
            const alignments = markdownTableAlignments(lines[index + 1] ?? "");
            const rows: string[][] = [];
            let cursor = index + 2;

            while (cursor < lines.length) {
                const candidate = String(lines[cursor] ?? "").trim();
                if (!candidate || !candidate.includes("|")) break;
                const cells = parseMarkdownTableRow(candidate);
                if (cells.length < 2) break;
                rows.push(cells);
                cursor++;
            }

            blocks.push(
                <div key={`table-${index}`} className="my-3 overflow-x-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.12]">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-[#EEF2F7] dark:bg-[#1C2334]/90">
                            <tr>
                                {headers.map((header, columnIndex) => (
                                    <th
                                        key={`table-${index}-head-${columnIndex}`}
                                        className={[
                                            "border-b border-[#E3E8F0] dark:border-white/[0.12] px-3 py-2 font-semibold text-[#313C55] dark:text-white",
                                            alignments[columnIndex] === "right"
                                                ? "text-right"
                                                : alignments[columnIndex] === "center"
                                                    ? "text-center"
                                                    : "text-left",
                                        ].join(" ")}
                                    >
                                        {renderInlineMarkdown(header, `table-${index}-head-${columnIndex}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E8F0] dark:divide-white/[0.12] bg-white dark:bg-[#232B3F]/40">
                            {rows.map((row, rowIndex) => (
                                <tr key={`table-${index}-row-${rowIndex}`} className="hover:bg-[#EEF2F7] dark:hover:bg-white/5">
                                    {headers.map((_, columnIndex) => (
                                        <td
                                            key={`table-${index}-cell-${rowIndex}-${columnIndex}`}
                                            className={[
                                                "px-3 py-2 text-[#313C55] dark:text-[#D6DCE8]",
                                                alignments[columnIndex] === "right"
                                                    ? "text-right tabular-nums"
                                                    : alignments[columnIndex] === "center"
                                                        ? "text-center"
                                                        : "text-left",
                                            ].join(" ")}
                                        >
                                            {renderInlineMarkdown(row[columnIndex] ?? "", `table-${index}-cell-${rowIndex}-${columnIndex}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

            index = cursor;
            continue;
        }

        if (!trimmed) {
            blocks.push(<div key={`gap-${index}`} className="h-1" />);
            index++;
            continue;
        }

        const bullet = trimmed.match(/^[-•]\s+(.+)$/);
        if (bullet) {
            blocks.push(
                <div key={`bullet-${index}`} className="flex items-start gap-2 pl-0.5">
                    <span className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7A8396]" />
                    <div className="min-w-0 flex-1">{renderInlineMarkdown(bullet[1], `bullet-${index}`)}</div>
                </div>
            );
            index++;
            continue;
        }

        const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
        if (numbered) {
            blocks.push(
                <div key={`number-${index}`} className="flex items-start gap-2">
                    <span className="min-w-5 shrink-0 font-medium text-[#5B6478] dark:text-[#AEB9CF]">{numbered[1]}.</span>
                    <div className="min-w-0 flex-1">{renderInlineMarkdown(numbered[2], `number-${index}`)}</div>
                </div>
            );
            index++;
            continue;
        }

        blocks.push(<div key={`line-${index}`}>{renderInlineMarkdown(line, `line-${index}`)}</div>);
        index++;
    }

    return <div className="space-y-1.5">{blocks}</div>;
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

function IconCamera({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
            <circle cx="12" cy="13" r="4" />
        </svg>
    );
}

function IconPaperclip({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.83-2.83l8.49-8.48" />
        </svg>
    );
}

function IconX({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    );
}

function IconMic({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <path d="M12 17v5" />
            <path d="M8 22h8" />
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] text-white shadow-sm">
            <IconSparkles className="h-4.5 w-4.5" />
        </div>
    );
}

function TypingIndicator({ label = "Consultando dados" }: { label?: string }) {
    return (
        <div className="flex items-start gap-3">
            <AssistantAvatar />
            <div className="rounded-2xl rounded-tl-md border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2" aria-label={label}>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396] [animation-delay:-0.25s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396] [animation-delay:-0.12s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396]" />
                    </div>
                    <span className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">{label}</span>
                </div>
            </div>
        </div>
    );
}


function KnowledgeSources({ sources }: { sources?: KnowledgeSource[] }) {
    const items = Array.isArray(sources) ? sources : [];
    const [expanded, setExpanded] = useState(false);

    if (!items.length) return null;

    return (
        <div className="mt-3 border-t border-[#EEF2F7] dark:border-white/[0.08] pt-2.5">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA] transition hover:text-[#313C55] dark:hover:text-white"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#E6F7FE] dark:bg-[#00AEEC]/20 text-[#0086B8] dark:text-[#5CCBF4]">
                        K
                    </span>
                    <span className="truncate">
                        Base de Conhecimento • {items.length} {items.length === 1 ? "fonte" : "fontes"}
                    </span>
                </span>

                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>

            {expanded ? (
                <div className="mt-2 space-y-2">
                    {items.map((source) => {
                        const meta = [
                            source.departamento || "",
                            source.natureza || "",
                            source.versao ? `v${source.versao}` : "",
                            source.paginas ? `p. ${source.paginas}` : "",
                        ].filter(Boolean);

                        return (
                            <div
                                key={`kb-${source.documento_id}`}
                                className="rounded-xl border border-[#8FD6F4] dark:border-[#00AEEC]/30 bg-[#E6F7FE]/45 dark:bg-[#00AEEC]/10 px-3 py-2.5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-semibold text-[#313C55] dark:text-[#E8ECF4]">{source.titulo}</div>
                                        {meta.length ? (
                                            <div className="mt-0.5 text-[10px] text-[#5B6478] dark:text-[#AEB9CF]">{meta.join(" • ")}</div>
                                        ) : null}
                                    </div>
                                    {source.alerta_pendente ? (
                                        <span className="shrink-0 rounded-full bg-[#FCF3CC] dark:bg-[#F2CB3F]/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#7A5600] dark:text-[#F2CB3F] ring-1 ring-inset ring-[#F2CB3F]/70 dark:ring-[#F2CB3F]/40">
                                            Conflito pendente
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
    return (
        <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] text-white shadow-lg shadow-[#313C55]/15 dark:shadow-black/30">
                <IconSparkles className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#313C55] dark:text-white sm:text-3xl">Aurora</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5B6478] dark:text-[#AEB9CF] sm:text-base">
                Assistente Administrativo do PAI. Consulta dados, gera arquivos e prepara ações administrativas que só são executadas após sua confirmação.
            </p>
            <div className="mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt, index) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => onPrompt(prompt)}
                        className={[
                            "rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-sm transition active:scale-[0.99]",
                            index === 0
                                ? "border-[#8FD6F4] dark:border-[#00AEEC]/50 bg-[#E6F7FE] dark:bg-[#00AEEC]/15 text-[#313C55] dark:text-[#E8ECF4] ring-1 ring-inset ring-[#00AEEC]/20 dark:ring-[#00AEEC]/30 hover:bg-[#D3EFFC] dark:hover:bg-[#00AEEC]/25"
                                : "border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-[#D6DCE8] hover:border-[#C9D1DE] dark:hover:border-white/40 hover:bg-[#EEF2F7] dark:hover:bg-white/10",
                        ].join(" ")}
                    >
                        {prompt}
                    </button>
                ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-[#EEF5D6] dark:bg-[#B3CE52]/15 px-3 py-1.5 text-xs font-medium text-[#5C7A12] dark:text-[#B3CE52] ring-1 ring-inset ring-[#B3CE52]/60 dark:ring-[#B3CE52]/40">
                    <IconShield /> Consultas controladas
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#FCF3CC] dark:bg-[#F2CB3F]/15 px-3 py-1.5 text-xs font-medium text-[#7A5600] dark:text-[#F2CB3F] ring-1 ring-inset ring-[#F2CB3F]/70 dark:ring-[#F2CB3F]/40">
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
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const [composerHeight, setComposerHeight] = useState(96);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const loadingRef = useRef(false);
    const pendingActionBusyRef = useRef<Set<string>>(new Set());
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingStartedAtRef = useRef(0);
    const recordingTimerRef = useRef<number | null>(null);
    const micPressedRef = useRef(false);
    const conversationRef = useRef<HTMLDivElement>(null);
    const autoFollowRef = useRef(true);
    const scrollRafRef = useRef<number | null>(null);
    const programmaticScrollUntilRef = useRef(0);
    const keyboardBaselineRef = useRef(0);

    useEffect(() => {
        const stored = loadStoredMessages();
        messagesRef.current = stored;
        setMessages(stored);
        setHydrated(true);
        void flushTelemetryQueue();
        const onOnline = () => { void flushTelemetryQueue(); };
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, []);

    useEffect(() => {
        messagesRef.current = messages;
        if (hydrated) saveStoredMessages(messages);
    }, [messages, hydrated]);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    // iOS/Safari:
    // - a barra permanece no rodapé quando o teclado está fechado;
    // - barras do Safari, scroll do VisualViewport e zoom da página NÃO são tratados como teclado;
    // - só elevamos o compositor quando existe um campo editável focado e a redução
    //   real do viewport é compatível com a abertura do teclado.
    useEffect(() => {
        if (typeof window === "undefined") return;

        const vv = window.visualViewport;
        if (!vv) {
            setKeyboardOpen(false);
            setKeyboardInset(0);
            return;
        }

        let raf = 0;
        let blurTimer: number | null = null;
        let orientationTimer: number | null = null;

        const hasEditableFocus = () => {
            const active = document.activeElement as HTMLElement | null;
            if (!active) return false;

            const tag = active.tagName;
            if (tag === "TEXTAREA" || tag === "SELECT") return true;

            if (tag === "INPUT") {
                const input = active as HTMLInputElement;
                const type = String(input.type || "text").toLowerCase();
                return ![
                    "button",
                    "checkbox",
                    "radio",
                    "submit",
                    "reset",
                    "file",
                    "image",
                    "range",
                    "color",
                    "hidden",
                ].includes(type);
            }

            return active.isContentEditable;
        };

        const visualBottom = () =>
            Math.max(1, Math.round(vv.height + Math.max(0, vv.offsetTop || 0)));

        const calibrateBaseline = () => {
            const current = Math.max(
                Math.round(window.innerHeight || 0),
                visualBottom(),
            );
            keyboardBaselineRef.current = current;
        };

        const updateKeyboardInset = () => {
            window.cancelAnimationFrame(raf);

            raf = window.requestAnimationFrame(() => {
                const focused = hasEditableFocus();
                const scale = Number(vv.scale || 1);

                // Sem um campo editável focado não existe motivo para levantar a barra.
                // Isso elimina o falso positivo causado pelas barras do Safari no iPhone.
                if (!focused || scale > 1.08) {
                    setKeyboardOpen(false);
                    setKeyboardInset(0);
                    calibrateBaseline();
                    return;
                }

                const visibleBottom = visualBottom();

                // Mantém a maior altura estável conhecida. Em algumas versões do iOS,
                // window.innerHeight também encolhe quando o teclado abre.
                const baseline = Math.max(
                    keyboardBaselineRef.current || 0,
                    Math.round(window.innerHeight || 0),
                    visibleBottom,
                );

                if (!keyboardBaselineRef.current) {
                    keyboardBaselineRef.current = baseline;
                }

                const occluded = Math.max(0, Math.round(baseline - visibleBottom));

                // 140px evita interpretar a barra de endereço/rodapé do Safari
                // como teclado virtual em aparelhos com viewport menor.
                const isKeyboard =
                    occluded >= 140 &&
                    vv.height <= baseline - 120;

                if (!isKeyboard) {
                    setKeyboardOpen(false);
                    setKeyboardInset(0);
                    return;
                }

                // Limite defensivo para nunca posicionar o compositor no meio da tela
                // por causa de uma leitura anômala do VisualViewport.
                const safeInset = Math.min(
                    occluded,
                    Math.max(0, Math.floor(baseline * 0.58)),
                );

                setKeyboardOpen(true);
                setKeyboardInset(safeInset);
            });
        };

        const onFocusIn = () => {
            if (blurTimer != null) {
                window.clearTimeout(blurTimer);
                blurTimer = null;
            }
            updateKeyboardInset();
            window.setTimeout(updateKeyboardInset, 60);
            window.setTimeout(updateKeyboardInset, 220);
        };

        const onFocusOut = () => {
            if (blurTimer != null) window.clearTimeout(blurTimer);
            blurTimer = window.setTimeout(() => {
                if (!hasEditableFocus()) {
                    setKeyboardOpen(false);
                    setKeyboardInset(0);
                    calibrateBaseline();
                } else {
                    updateKeyboardInset();
                }
            }, 90);
        };

        const onOrientationChange = () => {
            keyboardBaselineRef.current = 0;
            setKeyboardOpen(false);
            setKeyboardInset(0);

            if (orientationTimer != null) window.clearTimeout(orientationTimer);
            orientationTimer = window.setTimeout(() => {
                calibrateBaseline();
                updateKeyboardInset();
            }, 320);
        };

        calibrateBaseline();
        updateKeyboardInset();

        vv.addEventListener("resize", updateKeyboardInset);
        vv.addEventListener("scroll", updateKeyboardInset);
        window.addEventListener("resize", updateKeyboardInset);
        window.addEventListener("orientationchange", onOrientationChange);
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);

        return () => {
            window.cancelAnimationFrame(raf);
            if (blurTimer != null) window.clearTimeout(blurTimer);
            if (orientationTimer != null) window.clearTimeout(orientationTimer);

            vv.removeEventListener("resize", updateKeyboardInset);
            vv.removeEventListener("scroll", updateKeyboardInset);
            window.removeEventListener("resize", updateKeyboardInset);
            window.removeEventListener("orientationchange", onOrientationChange);
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
        };
    }, []);

    // Reserva espaço para que a última mensagem nunca fique escondida atrás
    // do compositor fixo. ResizeObserver acompanha textarea e sugestões.
    useEffect(() => {
        const el = composerRef.current;
        if (!el) return;

        const updateComposerHeight = () => {
            const next = Math.max(72, Math.ceil(el.getBoundingClientRect().height));
            setComposerHeight(next);
        };

        updateComposerHeight();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateComposerHeight);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    function scrollToLatest(behavior: ScrollBehavior = "auto", force = false) {
        if (typeof window === "undefined") return;
        if (!force && !autoFollowRef.current) return;

        if (scrollRafRef.current != null) {
            window.cancelAnimationFrame(scrollRafRef.current);
        }

        programmaticScrollUntilRef.current = Date.now() + (behavior === "smooth" ? 900 : 180);
        scrollRafRef.current = window.requestAnimationFrame(() => {
            const target = bottomRef.current;
            if (target) {
                target.scrollIntoView({ behavior, block: "end" });
            } else {
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
            }

            // Um segundo frame cobre alterações de altura causadas por streaming/cards
            // no mesmo ciclo de renderização. Durante streaming usamos movimento imediato
            // para não acumular várias animações suaves concorrentes.
            window.requestAnimationFrame(() => {
                if (!autoFollowRef.current && !force) return;
                bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
            });
        });
    }

    // Comportamento semelhante a apps de mensagem:
    // - enquanto o usuário está acompanhando o final, novas respostas permanecem visíveis;
    // - se ele rolar manualmente para mensagens antigas, não é puxado de volta;
    // - ao enviar nova mensagem, o acompanhamento é reativado.
    useEffect(() => {
        if (typeof window === "undefined") return;

        const updateAutoFollow = () => {
            if (Date.now() < programmaticScrollUntilRef.current) return;
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const viewportBottom = window.scrollY + viewportHeight;
            const documentBottom = Math.max(
                document.documentElement.scrollHeight,
                document.body?.scrollHeight || 0,
            );
            const distance = Math.max(0, documentBottom - viewportBottom);
            autoFollowRef.current = distance <= Math.max(220, composerHeight + 96);
        };

        updateAutoFollow();
        window.addEventListener("scroll", updateAutoFollow, { passive: true });
        return () => window.removeEventListener("scroll", updateAutoFollow);
    }, [composerHeight]);

    // Cada delta da Aurora pode aumentar a altura do balão. Se estamos no final do
    // chat, acompanha imediatamente a resposta para o usuário não precisar arrastar.
    useEffect(() => {
        if (!messages.length) return;
        const hasStreamingAssistant = messages.some((message) => message.role === "assistant" && message.streaming);
        scrollToLatest(hasStreamingAssistant || loading ? "auto" : "smooth");
    }, [messages, loading, composerHeight, keyboardInset]);

    // Cards, formulários e imagens podem crescer depois do texto terminar. O observer
    // mantém o rodapé visível enquanto a resposta está chegando ou acabou de renderizar.
    useEffect(() => {
        const el = conversationRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;

        let lastHeight = Math.ceil(el.getBoundingClientRect().height);
        const observer = new ResizeObserver(() => {
            const nextHeight = Math.ceil(el.getBoundingClientRect().height);
            if (nextHeight === lastHeight) return;
            lastHeight = nextHeight;
            if (autoFollowRef.current) scrollToLatest(loadingRef.current ? "auto" : "smooth");
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hydrated]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
            if (recordingTimerRef.current != null) window.clearInterval(recordingTimerRef.current);
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                    mediaRecorderRef.current.stop();
                }
            } catch { }
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    useEffect(() => {
        return () => {
            if (selectedFilePreview?.startsWith("blob:")) {
                try { URL.revokeObjectURL(selectedFilePreview); } catch { }
            }
        };
    }, [selectedFilePreview]);

    const canSend = useMemo(
        () => (input.trim().length > 0 || Boolean(selectedFile)) && !loading && !transcribing && !recording && !uploadingAttachment,
        [input, selectedFile, loading, transcribing, recording, uploadingAttachment],
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

    function removeOperationalFlowEverywhere(flowId: string) {
        const next = messagesRef.current.map((message) => {
            if (!message.operationalFlows?.length) return message;
            const operationalFlows = message.operationalFlows.filter((flow) => flow.id !== flowId);
            return operationalFlows.length === message.operationalFlows.length ? message : { ...message, operationalFlows };
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
                    result?: OperationalExecutionResult | null;
                    telemetry_start?: TelemetryStart | null;
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

            if (decision === "execute") {
                if (json.telemetry_start) {
                    saveTelemetrySnapshot(json.telemetry_start);
                } else if (json.result) {
                    await finishTelemetryIfNeeded(json.result);
                }
            }

            return {
                reply: String(json.reply || (decision === "execute" ? "Ação concluída com sucesso." : "Ação cancelada.")).trim(),
                result: json.result || null,
                telemetryStart: json.telemetry_start || null,
            };
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
            const outcome = await callPendingAction(action, decision);
            appendMessage({
                id: makeId("assistant-action"),
                role: "assistant",
                content: outcome.reply,
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


    async function prepareOperationalAction(
        flow: OperationalFlowCard,
        vehicle?: VehicleOption,
    ) {
        if (loadingRef.current) return;

        const attendance = flow.attendance;
        const action = flow.action;
        if (!attendance || !action?.phase) return;

        if (action.vehicle_required && !vehicle?.id) {
            setError("Selecione o veículo antes de continuar.");
            return;
        }

        if (action.vehicle_required) {
            const active = readTelemetrySnapshot();
            if (active) {
                const activeId = String(active.id ?? active.sepultamento_id ?? "");
                if (activeId && activeId !== String(attendance.id)) {
                    setError(
                        `Já existe um deslocamento em andamento para outro atendimento (${active.falecido || activeId}). Finalize-o antes de iniciar outro.`,
                    );
                    return;
                }
            }
        }

        setError("");
        loadingRef.current = true;
        setLoading(true);

        try {
            const response = await fetch(`${CHAT_API}?action=prepare-operational&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    attendance_id: attendance.id,
                    phase: action.phase,
                    ...(vehicle?.id ? { vehicle_id: vehicle.id } : {}),
                }),
            });

            const json = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    msg?: string;
                    reply?: string;
                    need_login?: 1;
                    pending_actions?: unknown;
                }
                | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }
            if (!response.ok || !json?.ok) {
                throw new Error(json?.msg || "Não foi possível preparar esta ação.");
            }

            const pendingActions = sanitizePendingActions(json.pending_actions);
            if (!pendingActions.length) {
                throw new Error("O servidor não devolveu a confirmação da ação.");
            }

            // Remove o card antigo para não duplicar a mesma próxima ação.
            removeOperationalFlowEverywhere(flow.id);

            appendMessage({
                id: makeId("assistant-operational"),
                role: "assistant",
                content: json.reply || "Confirme a ação.",
                createdAt: nowIso(),
                pendingActions,
                streaming: false,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Não foi possível preparar esta ação.");
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }

    function removeEditFormEverywhere(formId: string) {
        const next = messagesRef.current.map((message) => {
            if (!message.editForms?.length) return message;
            const editForms = message.editForms.filter((form) => form.id !== formId);
            return editForms.length === message.editForms.length ? message : { ...message, editForms };
        });
        commitMessages(next);
    }

    async function prepareAttendanceEdit(form: AttendanceEditForm, values: Record<string, unknown>) {
        if (loadingRef.current) return;
        setError("");
        loadingRef.current = true;
        setLoading(true);
        try {
            const response = await fetch(`${CHAT_API}?action=prepare-edit&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attendance_id: form.attendance_id, changes: values }),
            });
            const json = (await response.json().catch(() => null)) as {
                ok?: boolean;
                msg?: string;
                reply?: string;
                need_login?: 1;
                pending_actions?: unknown;
                edit_forms?: unknown;
            } | null;
            if (response.status === 401 || json?.need_login) throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            if (!response.ok || !json?.ok) throw new Error(json?.msg || "Não foi possível preparar a alteração.");

            const pendingActions = sanitizePendingActions(json.pending_actions);
            const editForms = sanitizeEditForms(json.edit_forms);
            removeEditFormEverywhere(form.id);
            appendMessage({
                id: makeId("assistant-edit"),
                role: "assistant",
                content: json.reply || (pendingActions.length ? "Revise e confirme as alterações." : "Complete os dados abaixo."),
                createdAt: nowIso(),
                pendingActions,
                editForms,
                streaming: false,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Não foi possível preparar a alteração.");
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }

    function preferredAudioMimeType() {
        if (typeof MediaRecorder === "undefined") return "";
        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
            "audio/mp4",
        ];
        return candidates.find((type) => {
            try {
                return MediaRecorder.isTypeSupported(type);
            } catch {
                return false;
            }
        }) || "";
    }

    async function transcribeAndSend(blob: Blob, mimeType: string) {
        if (!blob.size) return;
        setTranscribing(true);
        setError("");

        try {
            const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
            const form = new FormData();
            form.append("audio", blob, `aurora-${Date.now()}.${ext}`);

            const response = await fetch(`${CHAT_API}?action=transcribe&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                body: form,
            });

            const json = (await response.json().catch(() => null)) as
                | { ok?: boolean; text?: string; msg?: string; need_login?: 1 }
                | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }
            if (!response.ok || !json?.ok) {
                throw new Error(json?.msg || "Não foi possível entender o áudio.");
            }

            const text = String(json.text || "").trim();
            if (!text) throw new Error("Não foi possível identificar fala no áudio.");
            await sendMessage(text);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Não foi possível entender o áudio.");
        } finally {
            setTranscribing(false);
        }
    }

    async function startRecording() {
        if (loadingRef.current || transcribing || recording) return;
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setError("Este navegador não oferece gravação de áudio para a Aurora.");
            return;
        }

        try {
            setError("");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            if (!micPressedRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            mediaStreamRef.current = stream;
            audioChunksRef.current = [];

            const mimeType = preferredAudioMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recordingStartedAtRef.current = Date.now();
            setRecordingSeconds(0);

            recorder.ondataavailable = (event) => {
                if (event.data?.size) audioChunksRef.current.push(event.data);
            };

            recorder.onerror = () => {
                setError("A gravação foi interrompida. Tente novamente.");
            };

            recorder.onstop = () => {
                if (recordingTimerRef.current != null) {
                    window.clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
                const chunks = [...audioChunksRef.current];
                audioChunksRef.current = [];
                const type = recorder.mimeType || mimeType || "audio/webm";
                const elapsed = Date.now() - recordingStartedAtRef.current;
                mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
                mediaStreamRef.current = null;
                mediaRecorderRef.current = null;
                setRecording(false);
                setRecordingSeconds(0);

                // Toques acidentais muito curtos não são enviados.
                if (elapsed < 350 || !chunks.length) return;
                const blob = new Blob(chunks, { type });
                void transcribeAndSend(blob, type);
            };

            recorder.start(200);
            setRecording(true);
            recordingTimerRef.current = window.setInterval(() => {
                const seconds = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
                setRecordingSeconds(seconds);
                if (seconds >= 90) {
                    micPressedRef.current = false;
                    stopRecording();
                }
            }, 250);
        } catch (err: unknown) {
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
            const name = err instanceof DOMException ? err.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                setError("Permita o acesso ao microfone para enviar mensagens de áudio.");
            } else {
                setError(err instanceof Error ? err.message : "Não foi possível iniciar o microfone.");
            }
        }
    }

    function clearSelectedFile() {
        if (selectedFilePreview?.startsWith("blob:")) {
            try { URL.revokeObjectURL(selectedFilePreview); } catch { }
        }
        setSelectedFile(null);
        setSelectedFilePreview(null);
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }

    function chooseFile(file?: File | null) {
        if (!file) return;
        const max = 15 * 1024 * 1024;
        const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
        if (!allowed.has(file.type)) {
            setError("Envie uma imagem JPG/PNG/WEBP ou um PDF.");
            return;
        }
        if (file.size <= 0 || file.size > max) {
            setError("O arquivo precisa ter no máximo 15 MB.");
            return;
        }

        if (selectedFilePreview?.startsWith("blob:")) {
            try { URL.revokeObjectURL(selectedFilePreview); } catch { }
        }

        setError("");
        setSelectedFile(file);
        setSelectedFilePreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
        requestAnimationFrame(() => textareaRef.current?.focus());
    }

    async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
        setUploadingAttachment(true);
        try {
            const form = new FormData();
            form.append("attachment", file, file.name || `aurora-${Date.now()}`);

            const response = await fetch(`${CHAT_API}?action=upload-chat-file&_=${Date.now()}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                body: form,
            });

            const json = (await response.json().catch(() => null)) as
                | { ok?: boolean; msg?: string; need_login?: 1; attachment?: unknown }
                | null;

            if (response.status === 401 || json?.need_login) {
                throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
            }
            if (!response.ok || json?.ok !== true) {
                throw new Error(json?.msg || "Não foi possível enviar o arquivo.");
            }

            const attachment = sanitizeAttachment(json.attachment);
            if (!attachment) throw new Error("O servidor não devolveu os dados do anexo.");
            return attachment;
        } finally {
            setUploadingAttachment(false);
        }
    }

    function stopRecording() {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        try {
            recorder.stop();
        } catch {
            setRecording(false);
        }
    }

    async function sendMessage(rawText?: string) {
        const text = String(rawText ?? input).trim();
        const fileToSend = rawText === undefined ? selectedFile : null;
        if ((!text && !fileToSend) || loadingRef.current || transcribing || recording || uploadingAttachment) return;

        const pending = latestPendingAction();
        if (!fileToSend && pending && isExplicitConfirmCommand(text)) {
            await runPendingActionFromText(pending, "execute", text);
            return;
        }
        if (!fileToSend && pending && isExplicitCancelCommand(text)) {
            await runPendingActionFromText(pending, "cancel", text);
            return;
        }

        setError("");

        let uploadedAttachment: ChatAttachment | null = null;
        try {
            if (fileToSend) {
                uploadedAttachment = await uploadChatAttachment(fileToSend);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
            return;
        }

        const visibleText = text || (uploadedAttachment?.kind === "image" ? "Enviei uma foto." : "Enviei um arquivo.");
        const apiText = uploadedAttachment
            ? `${visibleText}\n\n${attachmentApiContext(uploadedAttachment)}`
            : visibleText;

        setInput("");
        if (fileToSend) clearSelectedFile();

        const userMessage: ChatMessage = {
            id: makeId("user"),
            role: "user",
            content: visibleText,
            apiContent: apiText,
            attachment: uploadedAttachment,
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

        autoFollowRef.current = true;
        const next = [...messagesRef.current, userMessage, assistantPlaceholder];
        commitMessages(next);
        window.requestAnimationFrame(() => scrollToLatest("auto", true));
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
        let finalOperationalFlows: OperationalFlowCard[] = [];
        let finalEditForms: AttendanceEditForm[] = [];
        let finalKnowledgeSources: KnowledgeSource[] = [];
        let streamError = "";

        try {
            const payloadMessages = [...messagesRef.current]
                .filter((m) => m.id !== assistantId && m.content.trim())
                .slice(-MAX_HISTORY_TO_API)
                .map(({ role, content, apiContent }) => ({ role, content: apiContent || content }));

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
                    if (Array.isArray(data?.operational_flows)) finalOperationalFlows = sanitizeOperationalFlows(data.operational_flows);
                    if (Array.isArray(data?.edit_forms)) finalEditForms = sanitizeEditForms(data.edit_forms);
                    if (Array.isArray(data?.knowledge_sources)) finalKnowledgeSources = sanitizeKnowledgeSources(data.knowledge_sources);

                    updateMessage(assistantId, (m) => ({
                        ...m,
                        toolsUsed: finalTools,
                        productCards: finalProductCards,
                        productSuggestions: finalProductSuggestions,
                        exportCards: finalExportCards,
                        pendingActions: finalPendingActions,
                        operationalFlows: finalOperationalFlows,
                        editForms: finalEditForms,
                        knowledgeSources: finalKnowledgeSources,
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
                operationalFlows: finalOperationalFlows,
                editForms: finalEditForms,
                knowledgeSources: finalKnowledgeSources,
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
        if (loading || recording || transcribing) return;
        abortRef.current?.abort();
        autoFollowRef.current = true;
        commitMessages([]);
        setInput("");
        clearSelectedFile();
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
        <div className="flex min-h-[calc(100dvh-var(--header-height,0px))] flex-col bg-background text-foreground">
            <header className="sticky top-[var(--header-height,0px)] z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
                <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] text-white">
                            <IconeAurora className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-sm font-semibold text-[#313C55] dark:text-white sm:text-base">Aurora</h1>
                                <span className="hidden rounded-full bg-[#EEF5D6] dark:bg-[#B3CE52]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5C7A12] dark:text-[#B3CE52] ring-1 ring-inset ring-[#B3CE52]/60 dark:ring-[#B3CE52]/40 sm:inline-flex">
                                    Ações confirmadas
                                </span>
                                <span className="hidden rounded-full bg-[#E6F7FE] dark:bg-[#00AEEC]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0086B8] dark:text-[#5CCBF4] ring-1 ring-inset ring-[#8FD6F4] dark:ring-[#00AEEC]/40 md:inline-flex">
                                    Base de conhecimento
                                </span>
                            </div>
                            <p className="truncate text-xs text-[#5B6478] dark:text-[#AEB9CF]">Assistente Administrativo • dados operacionais + Base de Conhecimento</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={clearChat}
                        disabled={loading || recording || transcribing || messages.length === 0}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF] transition hover:bg-[#EEF2F7] dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Iniciar novo chat"
                    >
                        <IconPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Novo chat</span>
                    </button>
                </div>
            </header>

            <main
                className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 sm:px-6"
                style={{ paddingBottom: `${composerHeight + 12}px`, scrollPaddingBottom: `${composerHeight + 20}px` }}
            >
                {!hydrated ? (
                    <div className="flex flex-1 items-center justify-center py-20 text-sm text-[#7A8396] dark:text-[#8893AA]">Carregando chat...</div>
                ) : messages.length === 0 ? (
                    <EmptyState onPrompt={(prompt) => void sendMessage(prompt)} />
                ) : (
                    <div ref={conversationRef} className="mx-auto w-full max-w-3xl flex-1 space-y-6 py-6 sm:py-8">
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
                                                    ? "rounded-2xl rounded-br-md bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] text-white shadow-sm"
                                                    : "rounded-2xl rounded-tl-md border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-[#E8ECF4] shadow-sm",
                                            ].join(" ")}
                                        >
                                            {isUser ? (
                                                <div>
                                                    {message.attachment ? (
                                                        <div className="mb-2 overflow-hidden rounded-xl border border-white/15 bg-white/10 text-left">
                                                            {message.attachment.kind === "image" && message.attachment.preview_url ? (
                                                                <img
                                                                    src={message.attachment.preview_url}
                                                                    alt={message.attachment.name}
                                                                    className="max-h-64 w-full object-contain bg-black/10"
                                                                    loading="lazy"
                                                                />
                                                            ) : null}
                                                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/85">
                                                                <IconPaperclip className="h-4 w-4 shrink-0" />
                                                                <span className="truncate">{message.attachment.name}</span>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    <div className="whitespace-pre-wrap">{message.content}</div>
                                                </div>
                                            ) : message.content ? (
                                                <>
                                                    <AssistantContent content={message.content} />
                                                    <ProductCards products={message.productCards} />
                                                    <ExportCards cards={message.exportCards} />
                                                    <PendingActionCards
                                                        actions={message.pendingActions}
                                                        disabled={loading || transcribing || recording}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
                                                    <AttendanceEditForms
                                                        forms={message.editForms}
                                                        disabled={loading || transcribing || recording}
                                                        onSubmit={(form, values) => prepareAttendanceEdit(form, values)}
                                                    />
                                                    <OperationalFlowCards
                                                        flows={message.operationalFlows}
                                                        disabled={loading || transcribing || recording}
                                                        onChooseAttendance={(choice) => void sendMessage(`Quero realizar uma ação no atendimento #${choice.id} - ${choice.falecido}`)}
                                                        onChooseAction={(flow) => void prepareOperationalAction(flow)}
                                                        onChooseVehicleAction={(flow, vehicle) => prepareOperationalAction(flow, vehicle)}
                                                    />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                    <KnowledgeSources sources={message.knowledgeSources} />
                                                </>
                                            ) : (message.productCards?.length || message.productSuggestions?.length || message.exportCards?.length || message.pendingActions?.length || message.operationalFlows?.length || message.editForms?.length || message.knowledgeSources?.length) ? (
                                                <>
                                                    <ProductCards products={message.productCards} />
                                                    <ExportCards cards={message.exportCards} />
                                                    <PendingActionCards
                                                        actions={message.pendingActions}
                                                        disabled={loading || transcribing || recording}
                                                        onConfirm={(action) => void runPendingActionFromText(action, "execute")}
                                                        onCancel={(action) => void runPendingActionFromText(action, "cancel")}
                                                    />
                                                    <AttendanceEditForms
                                                        forms={message.editForms}
                                                        disabled={loading || transcribing || recording}
                                                        onSubmit={(form, values) => prepareAttendanceEdit(form, values)}
                                                    />
                                                    <OperationalFlowCards
                                                        flows={message.operationalFlows}
                                                        disabled={loading || transcribing || recording}
                                                        onChooseAttendance={(choice) => void sendMessage(`Quero realizar uma ação no atendimento #${choice.id} - ${choice.falecido}`)}
                                                        onChooseAction={(flow) => void prepareOperationalAction(flow)}
                                                        onChooseVehicleAction={(flow, vehicle) => prepareOperationalAction(flow, vehicle)}
                                                    />
                                                    <ProductSuggestions
                                                        suggestions={message.productSuggestions}
                                                        disabled={loading}
                                                        onChoose={(name) => void sendMessage(name)}
                                                    />
                                                    <KnowledgeSources sources={message.knowledgeSources} />
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-1.5 py-1">
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396] [animation-delay:-0.25s]" />
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396] [animation-delay:-0.12s]" />
                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7A8396]" />
                                                </div>
                                            )}
                                        </div>

                                        {!isUser && message.toolsUsed?.length ? (
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {message.toolsUsed.map((tool) => (
                                                    <span key={`${message.id}-${tool}`} className="rounded-full bg-[#EEF2F7] dark:bg-[#1C2334] px-2 py-1 text-[10px] font-medium text-[#5B6478] dark:text-[#AEB9CF]">
                                                        {toolLabel(tool)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}

                        {transcribing ? (
                            <TypingIndicator label="Entendendo o áudio" />
                        ) : loading && !messages.some((m) => m.streaming && m.role === "assistant") ? (
                            <TypingIndicator label="Consultando dados" />
                        ) : null}

                        {error ? (
                            <div className="ml-0 rounded-2xl border border-[#F4B8B1] dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 px-4 py-3 text-sm leading-5 text-[#B42318] dark:text-[#FF9C92] sm:ml-12">
                                {error}
                            </div>
                        ) : null}
                        <div ref={bottomRef} style={{ scrollMarginBottom: `${composerHeight + 20}px` }} />
                    </div>
                )}
            </main>

            <div
                ref={composerRef}
                className="fixed inset-x-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:left-[var(--sidebar-width,17rem)]"
                style={{ bottom: keyboardOpen ? `${keyboardInset}px` : "0px" }}
            >
                <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-0 sm:py-4">
                    {messages.length > 0 && !loading && !keyboardOpen ? (
                        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {QUICK_PROMPTS.slice(0, 4).map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => void sendMessage(prompt)}
                                    className="shrink-0 rounded-full border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-1.5 text-xs font-medium text-[#5B6478] dark:text-[#AEB9CF] shadow-sm transition hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-lg shadow-black/5 dark:shadow-black/30 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
                    >
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            className="hidden"
                            onChange={(event) => chooseFile(event.target.files?.[0])}
                        />
                        <input
                            ref={attachmentInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                            onChange={(event) => chooseFile(event.target.files?.[0])}
                        />

                        {selectedFile ? (
                            <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-2">
                                {selectedFilePreview ? (
                                    <img src={selectedFilePreview} alt="" className="h-14 w-14 rounded-lg object-cover" />
                                ) : (
                                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-background ring-1 ring-border">
                                        <IconPaperclip className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1 text-left">
                                    <div className="truncate text-xs font-semibold">{selectedFile.name}</div>
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={clearSelectedFile}
                                    disabled={uploadingAttachment || loading}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                                    aria-label="Remover anexo"
                                    title="Remover anexo"
                                >
                                    <IconX />
                                </button>
                            </div>
                        ) : null}

                        <div className="flex items-end gap-2">
                            {!recording ? (
                                <>
                                    <button
                                        type="button"
                                        disabled={loading || transcribing || uploadingAttachment}
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Tirar foto"
                                        title="Tirar foto"
                                    >
                                        <IconCamera className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={loading || transcribing || uploadingAttachment}
                                        onClick={() => attachmentInputRef.current?.click()}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Anexar imagem ou PDF"
                                        title="Anexar imagem ou PDF"
                                    >
                                        <IconPaperclip className="h-5 w-5" />
                                    </button>
                                </>
                            ) : null}
                            {recording ? (
                                <div className="flex min-h-[44px] flex-1 items-center gap-3 px-3 py-2 text-sm text-[#B42318] dark:text-[#FF9C92]">
                                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#D93636]" />
                                    <span className="font-semibold">Gravando {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span>
                                    <span className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Solte para enviar</span>
                                </div>
                            ) : (
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={loading || transcribing || uploadingAttachment}
                                    rows={1}
                                    maxLength={5000}
                                    placeholder={uploadingAttachment ? "Enviando anexo..." : transcribing ? "Entendendo o áudio..." : loading ? "Recebendo resposta..." : "Pergunte à Aurora..."}
                                    className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
                                />
                            )}

                            {(input.trim() || selectedFile) && !recording ? (
                                <button
                                    type="submit"
                                    disabled={!canSend}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] text-white transition hover:bg-[#232B40] dark:hover:bg-[#0097CC] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#E3E8F0] dark:disabled:bg-white/15 disabled:text-[#7A8396] dark:disabled:text-[#8893AA]"
                                    aria-label="Enviar mensagem"
                                >
                                    <IconSend className="h-4.5 w-4.5" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={loading || transcribing || uploadingAttachment}
                                    onPointerDown={(event) => {
                                        if (event.pointerType === "mouse" && event.button !== 0) return;
                                        event.preventDefault();
                                        micPressedRef.current = true;
                                        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
                                        void startRecording();
                                    }}
                                    onPointerUp={(event) => {
                                        event.preventDefault();
                                        micPressedRef.current = false;
                                        stopRecording();
                                    }}
                                    onPointerCancel={() => {
                                        micPressedRef.current = false;
                                        stopRecording();
                                    }}
                                    onContextMenu={(event) => event.preventDefault()}
                                    className={[
                                        "flex h-10 w-10 shrink-0 touch-none select-none items-center justify-center rounded-xl text-white transition active:scale-95 disabled:cursor-not-allowed disabled:bg-[#E3E8F0] dark:disabled:bg-white/15 disabled:text-[#7A8396] dark:disabled:text-[#8893AA]",
                                        recording ? "bg-[#D93636] hover:bg-[#B42318]" : "bg-[#313C55] dark:bg-[#00AEEC] dark:text-[#313C55] hover:bg-[#232B40] dark:hover:bg-[#0097CC]",
                                    ].join(" ")}
                                    aria-label={recording ? "Solte para enviar o áudio" : "Segure para gravar uma mensagem"}
                                    title={recording ? "Solte para enviar" : "Segure para falar"}
                                >
                                    <IconMic className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
