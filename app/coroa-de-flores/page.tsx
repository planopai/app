"use client";

import * as React from "react";
import {
    IconCamera,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconCopy,
    IconEye,
    IconPhoto,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSend,
    IconUpload,
    IconX,
} from "@tabler/icons-react";

export const dynamic = "force-dynamic";

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */
const COROAS_API = "https://api.planoassistencialintegrado.com.br/coroas.php";
const ATENDIMENTOS_API = "/api/php/informativo.php?listar=1";

/* =========================================================
   PEDIDOS MANUAIS
   ========================================================= */
type ManualStatus = "novo" | "coroa" | "faixa" | "finalizada" | "entregue";
type ManualPagamento = "pago" | "aguardando_pagamento";
type ManualOrigem =
    | "ordem_servico"
    | "venda_direta_colaborador"
    | "venda_direta_escritorio"
    | "venda_direta_memorial";

type ManualOrder = {
    id: number;
    solicitante: string;
    modelo_coroa: string;
    frase: string;
    falecido: string;
    falecido_atendimento_id?: number | null;
    status_pagamento: ManualPagamento;
    origem: ManualOrigem;
    status: ManualStatus;
    comprovante_url?: string | null;
    foto_coroa_url?: string | null;
    criado_por?: string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
    coroa_inicio_em?: string | null;
    coroa_inicio_por?: string | null;
    faixa_inicio_em?: string | null;
    faixa_inicio_por?: string | null;
    finalizada_em?: string | null;
    finalizada_por?: string | null;
    entregue_em?: string | null;
    entregue_por?: string | null;
};

type ManualListResponse = {
    sucesso: boolean;
    dados: ManualOrder[];
    meta?: { page: number; per_page: number; total: number; total_pages: number };
    msg?: string;
};

type AtendimentoResumo = {
    id?: number | string;
    falecido?: string;
    status?: string;
    assistencia?: string;
    tanato?: string;
    ornamentacao?: string;
    tipo_atendimento?: string;
};

const MANUAL_STATUS_OPTIONS: Array<{ value: ManualStatus | "todos"; label: string }> = [
    { value: "todos", label: "Todos" },
    { value: "novo", label: "Aguardando Confecção" },
    { value: "coroa", label: "Coroa em Confecção" },
    { value: "faixa", label: "Faixa em Confecção" },
    { value: "finalizada", label: "Finalizada" },
    { value: "entregue", label: "Entregue" },
];

const ORIGEM_OPTIONS: Array<{ value: ManualOrigem; label: string }> = [
    { value: "ordem_servico", label: "Ordem de Serviço" },
    { value: "venda_direta_colaborador", label: "Venda Direta Colaborador" },
    { value: "venda_direta_escritorio", label: "Venda Direta Escritório" },
    { value: "venda_direta_memorial", label: "Venda Direta Memorial" },
];

const PAGAMENTO_OPTIONS: Array<{ value: ManualPagamento; label: string }> = [
    { value: "pago", label: "Pago" },
    { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
];

function manualStatusLabel(status?: ManualStatus | string) {
    return MANUAL_STATUS_OPTIONS.find((x) => x.value === status)?.label || status || "—";
}

function manualStatusClass(status?: ManualStatus | string) {
    switch (status) {
        case "novo":
            return "bg-slate-100 text-slate-800 border-slate-200";
        case "coroa":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "faixa":
            return "bg-violet-100 text-violet-800 border-violet-200";
        case "finalizada":
            return "bg-emerald-100 text-emerald-900 border-emerald-200";
        case "entregue":
            return "bg-zinc-200 text-zinc-800 border-zinc-300";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function pagamentoLabel(v?: ManualPagamento | string) {
    return PAGAMENTO_OPTIONS.find((x) => x.value === v)?.label || v || "—";
}

function pagamentoClass(v?: ManualPagamento | string) {
    return v === "pago"
        ? "bg-emerald-100 text-emerald-900 border-emerald-200"
        : "bg-amber-100 text-amber-900 border-amber-200";
}

function origemLabel(v?: ManualOrigem | string) {
    return ORIGEM_OPTIONS.find((x) => x.value === v)?.label || v || "—";
}

function proximoStatusManual(status: ManualStatus): ManualStatus | null {
    if (status === "novo") return "coroa";
    if (status === "coroa") return "faixa";
    if (status === "faixa") return "finalizada";
    if (status === "finalizada") return "entregue";
    return null;
}

function proximaAcaoLabel(status: ManualStatus) {
    const next = proximoStatusManual(status);
    if (next === "coroa") return "Coroa — Início de Confecção";
    if (next === "faixa") return "Faixa — Início de Confecção";
    if (next === "finalizada") return "Finalizada";
    if (next === "entregue") return "Entregue";
    return "Fluxo concluído";
}

function normalizeFuneralStatus(v?: string) {
    const raw = String(v || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw.startsWith("fase")) {
        const n = raw.replace(/\D+/g, "");
        return n ? `fase${n.padStart(2, "0")}` : raw;
    }
    const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const map: Record<string, string> = {
        removendo: "fase01",
        "aguardando procedimento": "fase02",
        preparando: "fase03",
        "aguardando ornamentacao": "fase04",
        ornamentando: "fase05",
        "corpo pronto": "fase06",
        transportando: "fase07",
        velando: "fase08",
        sepultando: "fase09",
        "sepultamento concluido": "fase10",
        "material recolhido": "fase11",
        concluido: "fase11",
    };
    return map[key] || raw;
}

function isNao(v?: string) {
    const s = String(v || "").trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n" || s === "0" || s === "false";
}

function atendimentoEstaNoQuadro(r: AtendimentoResumo) {
    const st = normalizeFuneralStatus(r.status);
    const terceiro =
        String(r.tipo_atendimento || "").toLowerCase() === "terceiro" ||
        (isNao(r.assistencia) && isNao(r.tanato) && isNao(r.ornamentacao));

    if (st === "fase11") return false;
    if (terceiro) return st !== "fase10";
    if (isNao(r.assistencia)) return st !== "fase10";
    return true;
}

async function fileToDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem válido.");
    if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
    });
}

function ImageUploadButtons({
    disabled,
    onFile,
}: {
    disabled?: boolean;
    onFile: (file: File) => Promise<void> | void;
}) {
    const galleryRef = React.useRef<HTMLInputElement>(null);
    const cameraRef = React.useRef<HTMLInputElement>(null);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        await onFile(file);
    };

    return (
        <div className="flex flex-wrap gap-2">
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handle} />
            <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handle}
            />
            <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                disabled={disabled}
                onClick={() => galleryRef.current?.click()}
            >
                <IconUpload className="size-4" />
                Galeria
            </button>
            <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                disabled={disabled}
                onClick={() => cameraRef.current?.click()}
            >
                <IconCamera className="size-4" />
                Tirar foto
            </button>
        </div>
    );
}

/* =========================================================
   PEDIDOS ONLINE / WOOCOMMERCE — comportamento existente
   ========================================================= */
type WcOrder = {
    id: number;
    status:
    | "pending"
    | "processing"
    | "on-hold"
    | "completed"
    | "cancelled"
    | "refunded"
    | "failed";
    date_created: string;
    number: string;
    currency: string;
    total: string;
    customer_note?: string;
    billing?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
    };
    shipping?: {
        first_name?: string;
        last_name?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
    };
};

type Meta = { key: string; value: any };

type WcOrderFull = WcOrder & {
    meta_data?: Meta[];
    line_items?: Array<{
        id: number;
        name: string;
        quantity: number;
        total: string;
        product_id?: number;
        variation_id?: number;
        sku?: string;
        meta_data?: Meta[];
        image?: { id: number | string; src: string };
    }>;
    shipping_lines?: Array<{ id: number; method_title: string; total: string }>;
};

type OrdersResponse = {
    data: WcOrder[];
    meta: { page: number; per_page: number; total: number; totalPages: number };
};

const WC_STATUS_OPTIONS: Array<{ value: WcOrder["status"] | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "pending", label: "Pendente" },
    { value: "processing", label: "Processando" },
    { value: "on-hold", label: "Em espera" },
    { value: "completed", label: "Concluído" },
    { value: "cancelled", label: "Cancelado" },
    { value: "refunded", label: "Reembolsado" },
    { value: "failed", label: "Falhou" },
];

function formatCurrency(v: string | number, currency = "BRL") {
    const num = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(num)) return String(v);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
}

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    try {
        const dt = new Date(iso.replace(" ", "T"));
        if (Number.isNaN(dt.getTime())) return iso;
        return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function clsWcStatusBadge(s: WcOrder["status"]) {
    switch (s) {
        case "pending":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "processing":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "on-hold":
            return "bg-slate-100 text-slate-800 border-slate-200";
        case "completed":
            return "bg-emerald-100 text-emerald-900 border-emerald-200";
        case "cancelled":
            return "bg-rose-100 text-rose-800 border-rose-200";
        case "refunded":
            return "bg-purple-100 text-purple-900 border-purple-200";
        case "failed":
            return "bg-gray-200 text-gray-700 border-gray-300";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function onlyDigits(s?: string) {
    return (s || "").replace(/\D+/g, "");
}

function findMetaValue(metas: Meta[] | undefined, keys: string[]): string | undefined {
    if (!metas?.length) return undefined;
    const lower = keys.map((k) => k.toLowerCase());
    for (const m of metas) {
        const k = String(m.key || "").toLowerCase();
        if (lower.some((kk) => k.includes(kk))) {
            const v = typeof m.value === "string" ? m.value : JSON.stringify(m.value);
            if (v?.trim()) return v;
        }
    }
    return undefined;
}

function buildWhatsAppText(order: WcOrderFull) {
    const NL = "\r\n";
    const ZWSP = "\u200B";
    const itens = (order.line_items || []).map((i) => i.name).filter(Boolean);
    const pedidoNome = itens.join(", ");
    const cliente = `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim();
    const phone = onlyDigits(order.billing?.phone);
    const valor = formatCurrency(order.total, order.currency || "BRL");
    const localEntrega = [order.shipping?.address_1, order.shipping?.address_2].filter(Boolean).join(" - ");
    const falecido =
        findMetaValue(order.meta_data, [
            "shipping_falecido_nome",
            "falecido_nome",
            "nome_falecido",
            "nome_do_falecido",
        ]) || order.shipping?.first_name || "";
    const frase =
        findMetaValue(order.meta_data, ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
        findMetaValue(order.line_items?.flatMap((li) => li.meta_data || []), [
            "frase_para_a_faixa",
            "frase da coroa",
            "frase da faixa",
            "faixa",
            "mensagem",
        ]) ||
        "";

    const rawLines = [
        `*Pedido:* ${pedidoNome || `#${order.number || order.id}`}`,
        `*Origem:* Loja On-line`,
        `*Cliente:* ${cliente || "—"}`,
        `*Telefone:* ${phone || "—"}`,
        `*Valor:* ${valor}`,
        `*Local de Entrega:* ${localEntrega || "—"}`,
        `*Falecido(a):* ${falecido || "—"}`,
        `*Frase da Coroa:* ${frase || "—"}`,
        `*Comprovante de pagamento:*`,
    ];

    const out: string[] = [];
    rawLines.forEach((l, i) => {
        out.push(l.trimStart());
        if (i < rawLines.length - 1) out.push(ZWSP);
    });
    return out.join(NL);
}

async function shareOrOpenWhatsApp(text: string, toPhone?: string) {
    const phone = onlyDigits(toPhone);
    if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
            await (navigator as any).share({ text });
            return;
        } catch {
            // segue para fallback
        }
    }

    const encoded = encodeURIComponent(text);
    const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(
        (typeof navigator !== "undefined" && navigator.userAgent) || "",
    );
    const deep = phone && isMobile
        ? `whatsapp://send?phone=${phone}&text=${encoded}`
        : `whatsapp://send?text=${encoded}`;
    const opened = window.open(deep, "_blank");
    if (opened) return;

    const webUrl = phone
        ? `https://wa.me/${phone}?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`;
    const openedWeb = window.open(webUrl, "_blank", "noopener,noreferrer");
    if (openedWeb) return;

    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // ignore
    }
    window.open(phone ? `https://wa.me/${phone}` : "https://web.whatsapp.com/", "_blank");
}

async function convertToJpegWithWhiteBg(blob: Blob): Promise<Blob> {
    const imgUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = imgUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width || 1024;
        canvas.height = img.height || 1024;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.92),
        );
    } finally {
        URL.revokeObjectURL(imgUrl);
    }
}

async function shareImageUrl(imageUrl: string) {
    if (!imageUrl) return;
    try {
        const resp = await fetch(imageUrl, { mode: "cors", cache: "no-store" });
        if (resp.ok) {
            let blob = await resp.blob();
            if (blob.type === "image/png") {
                try {
                    blob = await convertToJpegWithWhiteBg(blob);
                } catch {
                    // mantém original
                }
            }
            const file = new File([blob], `produto.${blob.type.includes("jpeg") ? "jpg" : "png"}`, {
                type: blob.type || "image/jpeg",
            });
            const navAny = navigator as any;
            if (navAny.canShare?.({ files: [file] }) && navAny.share) {
                await navAny.share({ files: [file] });
                return;
            }
        }
    } catch {
        // fallback abaixo
    }

    try {
        const navAny = navigator as any;
        if (navAny.share) {
            await navAny.share({ url: imageUrl });
            return;
        }
    } catch {
        // fallback abaixo
    }
    window.open(imageUrl, "_blank", "noopener,noreferrer");
}

/* =========================================================
   PÁGINA
   ========================================================= */
export default function Page() {
    const [tab, setTab] = React.useState<"manuais" | "online">("manuais");

    /* -------------------------
       Falecidos no quadro
       ------------------------- */
    const [falecidosQuadro, setFalecidosQuadro] = React.useState<AtendimentoResumo[]>([]);

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${ATENDIMENTOS_API}&_ts=${Date.now()}`, {
                    cache: "no-store",
                    credentials: "include",
                });
                if (!res.ok) return;
                const json = await res.json();
                if (!alive) return;
                const rows = Array.isArray(json) ? (json as AtendimentoResumo[]) : [];
                setFalecidosQuadro(
                    rows
                        .filter(atendimentoEstaNoQuadro)
                        .filter((r) => String(r.falecido || "").trim() !== "")
                        .sort((a, b) => String(a.falecido || "").localeCompare(String(b.falecido || ""), "pt-BR")),
                );
            } catch {
                // campo continua permitindo digitação manual
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    /* -------------------------
       Manual: lista/filtros
       ------------------------- */
    const [manualOrders, setManualOrders] = React.useState<ManualOrder[]>([]);
    const [manualLoading, setManualLoading] = React.useState(false);
    const [manualError, setManualError] = React.useState<string | null>(null);
    const [manualQ, setManualQ] = React.useState("");
    const [manualStatusFilter, setManualStatusFilter] = React.useState<ManualStatus | "todos">("todos");
    const [manualPage, setManualPage] = React.useState(1);
    const [manualMeta, setManualMeta] = React.useState({ page: 1, per_page: 30, total: 0, total_pages: 1 });

    const fetchManualOrders = React.useCallback(async () => {
        setManualLoading(true);
        setManualError(null);
        try {
            const u = new URL(COROAS_API, window.location.origin);
            u.searchParams.set("listar", "1");
            u.searchParams.set("page", String(manualPage));
            u.searchParams.set("per_page", "30");
            if (manualQ.trim()) u.searchParams.set("q", manualQ.trim());
            if (manualStatusFilter !== "todos") u.searchParams.set("status", manualStatusFilter);
            u.searchParams.set("_ts", String(Date.now()));

            const res = await fetch(u.toString(), { cache: "no-store", credentials: "include" });
            const json: ManualListResponse = await res.json().catch(() => ({ sucesso: false, dados: [] }));
            if (!res.ok || !json?.sucesso) throw new Error(json?.msg || `Falha ao carregar pedidos (${res.status}).`);
            setManualOrders(Array.isArray(json.dados) ? json.dados : []);
            if (json.meta) setManualMeta(json.meta);
        } catch (e: any) {
            setManualError(e?.message || "Erro ao carregar pedidos manuais.");
        } finally {
            setManualLoading(false);
        }
    }, [manualPage, manualQ, manualStatusFilter]);

    React.useEffect(() => {
        if (tab !== "manuais") return;
        fetchManualOrders();
    }, [tab, manualPage, fetchManualOrders]);

    /* -------------------------
       Manual: novo pedido
       ------------------------- */
    const [newOpen, setNewOpen] = React.useState(false);
    const [newSaving, setNewSaving] = React.useState(false);
    const [newError, setNewError] = React.useState<string | null>(null);
    const [newForm, setNewForm] = React.useState({
        solicitante: "",
        modelo_coroa: "",
        frase: "",
        falecido: "",
        status_pagamento: "aguardando_pagamento" as ManualPagamento,
        origem: "ordem_servico" as ManualOrigem,
    });

    function resetNewForm() {
        setNewForm({
            solicitante: "",
            modelo_coroa: "",
            frase: "",
            falecido: "",
            status_pagamento: "aguardando_pagamento",
            origem: "ordem_servico",
        });
        setNewError(null);
    }

    async function salvarNovoPedido(e: React.FormEvent) {
        e.preventDefault();
        setNewError(null);

        const required = [
            [newForm.solicitante, "Solicitante"],
            [newForm.modelo_coroa, "Modelo de Coroa"],
            [newForm.frase, "Frase"],
            [newForm.falecido, "Falecido(a)"],
        ] as const;
        const missing = required.find(([v]) => !String(v).trim());
        if (missing) {
            setNewError(`Preencha o campo ${missing[1]}.`);
            return;
        }

        const match = falecidosQuadro.find(
            (r) => String(r.falecido || "").trim().toLowerCase() === newForm.falecido.trim().toLowerCase(),
        );

        setNewSaving(true);
        try {
            const res = await fetch(COROAS_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    acao: "novo",
                    ...newForm,
                    falecido_atendimento_id: match?.id ? Number(match.id) || null : null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.sucesso) throw new Error(json?.msg || "Não foi possível criar o pedido.");
            setNewOpen(false);
            resetNewForm();
            setManualPage(1);
            await fetchManualOrders();
        } catch (e: any) {
            setNewError(e?.message || "Não foi possível criar o pedido.");
        } finally {
            setNewSaving(false);
        }
    }

    /* -------------------------
       Manual: detalhe / ações
       ------------------------- */
    const [manualDetailOpen, setManualDetailOpen] = React.useState(false);
    const [manualDetail, setManualDetail] = React.useState<ManualOrder | null>(null);
    const [manualDetailLoading, setManualDetailLoading] = React.useState(false);
    const [manualActionLoading, setManualActionLoading] = React.useState(false);
    const [manualDetailMsg, setManualDetailMsg] = React.useState<string | null>(null);

    async function openManualDetail(id: number) {
        setManualDetailOpen(true);
        setManualDetail(null);
        setManualDetailMsg(null);
        setManualDetailLoading(true);
        try {
            const res = await fetch(`${COROAS_API}?id=${encodeURIComponent(String(id))}&_ts=${Date.now()}`, {
                cache: "no-store",
                credentials: "include",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.sucesso) throw new Error(json?.msg || "Não foi possível carregar o pedido.");
            setManualDetail(json.dado as ManualOrder);
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Erro ao carregar pedido.");
        } finally {
            setManualDetailLoading(false);
        }
    }

    async function postManual(payload: Record<string, any>) {
        const res = await fetch(COROAS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.sucesso) throw new Error(json?.msg || "Não foi possível concluir a operação.");
        return json;
    }

    async function anexarFotoManual(tipo: "comprovante" | "coroa", file: File) {
        if (!manualDetail) return;
        setManualActionLoading(true);
        setManualDetailMsg(null);
        try {
            const base64 = await fileToDataUrl(file);
            await postManual({
                acao: tipo === "comprovante" ? "anexar_comprovante" : "anexar_foto_coroa",
                id: manualDetail.id,
                base64,
            });
            await openManualDetail(manualDetail.id);
            await fetchManualOrders();
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível anexar a imagem.");
        } finally {
            setManualActionLoading(false);
        }
    }

    async function atualizarPagamentoManual(status_pagamento: ManualPagamento) {
        if (!manualDetail) return;
        setManualActionLoading(true);
        setManualDetailMsg(null);
        try {
            await postManual({ acao: "atualizar_pagamento", id: manualDetail.id, status_pagamento });
            await openManualDetail(manualDetail.id);
            await fetchManualOrders();
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível atualizar o pagamento.");
        } finally {
            setManualActionLoading(false);
        }
    }

    async function executarProximaAcaoManual() {
        if (!manualDetail) return;
        const next = proximoStatusManual(manualDetail.status);
        if (!next) return;
        if (next === "finalizada" && !manualDetail.foto_coroa_url) {
            setManualDetailMsg("Para finalizar, anexe primeiro a foto da coroa pronta.");
            return;
        }
        if (!window.confirm(`Confirmar a ação “${proximaAcaoLabel(manualDetail.status)}”?`)) return;

        setManualActionLoading(true);
        setManualDetailMsg(null);
        try {
            await postManual({ acao: "atualizar_status", id: manualDetail.id, status: next });
            await openManualDetail(manualDetail.id);
            await fetchManualOrders();
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível registrar a ação.");
        } finally {
            setManualActionLoading(false);
        }
    }

    /* -------------------------
       Online / WooCommerce
       ------------------------- */
    const [q, setQ] = React.useState("");
    const [wcStatus, setWcStatus] = React.useState<"all" | WcOrder["status"]>("all");
    const [after, setAfter] = React.useState("");
    const [before, setBefore] = React.useState("");
    const [page, setPage] = React.useState(1);
    const [perPage, setPerPage] = React.useState(20);
    const [orders, setOrders] = React.useState<WcOrder[]>([]);
    const [meta, setMeta] = React.useState<OrdersResponse["meta"]>({
        page: 1,
        per_page: 20,
        total: 0,
        totalPages: 0,
    });
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState(false);
    const [detail, setDetail] = React.useState<WcOrderFull | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailImage, setDetailImage] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);

    const fetchOrders = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const u = new URL("/api/wc/orders", window.location.origin);
            u.searchParams.set("page", String(page));
            u.searchParams.set("per_page", String(perPage));
            if (q.trim()) u.searchParams.set("search", q.trim());
            if (wcStatus !== "all") u.searchParams.set("status", wcStatus);
            if (after) u.searchParams.set("after", new Date(after).toISOString());
            if (before) {
                const d = new Date(before);
                d.setHours(23, 59, 59, 999);
                u.searchParams.set("before", d.toISOString());
            }
            const res = await fetch(u.toString(), { cache: "no-store" });
            if (!res.ok) throw new Error(`Falha ao buscar pedidos (${res.status})`);
            const json: OrdersResponse = await res.json();
            setOrders(json.data);
            setMeta(json.meta);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar pedidos");
        } finally {
            setLoading(false);
        }
    }, [page, perPage, q, wcStatus, after, before]);

    React.useEffect(() => {
        if (tab !== "online") return;
        fetchOrders();
    }, [tab, page, perPage, fetchOrders]);

    async function openDetail(id: number) {
        setDetail(null);
        setDetailImage(null);
        setCopied(false);
        setOpen(true);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Falha ao carregar pedido #${id}`);
            const data: WcOrderFull = await res.json();
            setDetail(data);

            const fromOrder = data.line_items?.find((li) => li.image?.src)?.image?.src || null;
            if (fromOrder) {
                setDetailImage(fromOrder);
            } else {
                const pid = data.line_items?.[0]?.product_id;
                const vid = data.line_items?.[0]?.variation_id;
                if (pid) {
                    try {
                        const url = vid ? `/api/wc/products/${pid}/variations/${vid}` : `/api/wc/products/${pid}`;
                        const pr = await fetch(url, { cache: "no-store" });
                        if (pr.ok) {
                            const prod = await pr.json();
                            const src: string | undefined = prod?.image?.src || prod?.images?.[0]?.src;
                            if (src) setDetailImage(src);
                        }
                    } catch {
                        // mantém sem imagem
                    }
                }
            }
        } catch (e: any) {
            setDetail({
                id,
                number: String(id),
                status: "failed",
                date_created: new Date().toISOString(),
                currency: "BRL",
                total: "0",
                customer_note: e?.message || "Erro ao carregar",
            } as WcOrderFull);
        } finally {
            setDetailLoading(false);
        }
    }

    async function updateStatus(id: number, newStatus: WcOrder["status"]) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || "Falha ao atualizar status");
            }
            await fetchOrders();
            if (detail?.id === id) await openDetail(id);
        } catch (e: any) {
            alert(e?.message || "Não foi possível atualizar o status.");
        } finally {
            setUpdating(false);
        }
    }

    async function notifyWhatsApp(orderId: number) {
        try {
            const res = await fetch(`/api/wc/orders/${orderId}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Falha ao carregar o pedido #${orderId}`);
            const full: WcOrderFull = await res.json();
            await shareOrOpenWhatsApp(buildWhatsAppText(full));
        } catch (e: any) {
            alert(e?.message || "Não foi possível abrir o WhatsApp.");
        }
    }

    async function copyDetailToClipboard() {
        try {
            if (!detail) return;
            await navigator.clipboard.writeText(buildWhatsAppText(detail));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            alert("Não foi possível copiar o texto.");
        }
    }

    const canNotifyRow = (o: WcOrder) => o.status === "completed";
    const canNotifyDetail = detail?.status === "completed";

    return (
        <div className="flex h-full flex-col">
            {/* Cabeçalho */}
            <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Pedidos — Coroas de Flores</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {tab === "manuais" && (
                            <button
                                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                                onClick={() => {
                                    resetNewForm();
                                    setNewOpen(true);
                                }}
                            >
                                <IconPlus className="size-4" />
                                NOVO
                            </button>
                        )}
                        <button
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => (tab === "manuais" ? fetchManualOrders() : fetchOrders())}
                            disabled={tab === "manuais" ? manualLoading : loading}
                            title="Recarregar"
                        >
                            <IconRefresh className="size-4" />
                            Atualizar
                        </button>
                    </div>
                </div>

                {/* Abas */}
                <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1">
                    <button
                        type="button"
                        className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "manuais" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                        onClick={() => setTab("manuais")}
                    >
                        Pedidos Manuais
                    </button>
                    <button
                        type="button"
                        className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "online" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                        onClick={() => setTab("online")}
                    >
                        Pedidos Online
                    </button>
                </div>
            </div>

            {tab === "manuais" ? (
                <>
                    {/* Filtros manual */}
                    <form
                        className="mx-4 mb-3 grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3 lg:mx-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setManualPage(1);
                            fetchManualOrders();
                        }}
                    >
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium">Buscar</label>
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                                <input
                                    value={manualQ}
                                    onChange={(e) => setManualQ(e.target.value)}
                                    className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
                                    placeholder="Solicitante, falecido, modelo..."
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Status</label>
                            <div className="flex gap-2">
                                <select
                                    value={manualStatusFilter}
                                    onChange={(e) => setManualStatusFilter(e.target.value as ManualStatus | "todos")}
                                    className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                >
                                    {MANUAL_STATUS_OPTIONS.map((s) => (
                                        <option key={s.value} value={s.value}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                                <button type="submit" className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
                                    Buscar
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Manual mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {manualOrders.map((o) => (
                                <div key={o.id} className="rounded-lg border bg-card p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-medium">{o.solicitante}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">{o.falecido}</div>
                                        </div>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${manualStatusClass(o.status)}`}>
                                            {manualStatusLabel(o.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">{o.modelo_coroa}</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${pagamentoClass(o.status_pagamento)}`}>
                                            {pagamentoLabel(o.status_pagamento)}
                                        </span>
                                        <span className="rounded-full border px-2 py-0.5 text-[10px]">{origemLabel(o.origem)}</span>
                                    </div>
                                    <button
                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs text-white"
                                        onClick={() => openManualDetail(o.id)}
                                    >
                                        <IconEye className="size-4" />
                                        Ações
                                    </button>
                                </div>
                            ))}
                            {!manualLoading && manualOrders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido manual encontrado.</div>
                            )}
                            {manualLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>}
                            {manualError && <div className="text-sm text-rose-600">{manualError}</div>}
                        </div>
                    </div>

                    {/* Manual desktop */}
                    <div className="hidden flex-1 overflow-auto px-4 pb-6 md:block lg:px-6">
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium">Solicitante</th>
                                            <th className="px-3 py-2 font-medium">Falecido(a)</th>
                                            <th className="px-3 py-2 font-medium">Modelo</th>
                                            <th className="px-3 py-2 font-medium">Pagamento</th>
                                            <th className="px-3 py-2 font-medium">Origem</th>
                                            <th className="px-3 py-2 font-medium text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {manualOrders.map((o) => (
                                            <tr key={o.id} className="border-t">
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${manualStatusClass(o.status)}`}>
                                                        {manualStatusLabel(o.status)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{o.solicitante}</td>
                                                <td className="px-3 py-2">{o.falecido}</td>
                                                <td className="px-3 py-2">{o.modelo_coroa}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${pagamentoClass(o.status_pagamento)}`}>
                                                        {pagamentoLabel(o.status_pagamento)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{origemLabel(o.origem)}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white"
                                                        onClick={() => openManualDetail(o.id)}
                                                    >
                                                        <IconEye className="size-4" />
                                                        Ações
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!manualLoading && manualOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido manual encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {manualLoading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando…</div>}
                                {manualError && <div className="px-3 pb-3 text-sm text-rose-600">{manualError}</div>}
                            </div>
                            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                                <div>
                                    Página {manualMeta.page} de {Math.max(1, manualMeta.total_pages)} — {manualMeta.total} pedidos
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={manualPage <= 1 || manualLoading}
                                        onClick={() => setManualPage((p) => Math.max(1, p - 1))}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={manualPage >= manualMeta.total_pages || manualLoading}
                                        onClick={() => setManualPage((p) => p + 1)}
                                    >
                                        Próxima
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* ONLINE — filtros existentes */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setPage(1);
                            fetchOrders();
                        }}
                        className="mx-4 mb-3 grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:mx-6 lg:grid-cols-6"
                    >
                        <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                            <label className="mb-1 block text-xs font-medium">Buscar</label>
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                                <input
                                    className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
                                    placeholder="Nome, e-mail, nº do pedido..."
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Status</label>
                            <select
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={wcStatus}
                                onChange={(e) => setWcStatus(e.target.value as any)}
                            >
                                {WC_STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">De</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={after}
                                onChange={(e) => setAfter(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Até</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={before}
                                onChange={(e) => setBefore(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                                disabled={loading}
                            >
                                <IconSearch className="size-4" />
                                Buscar
                            </button>
                            <button
                                type="button"
                                className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm"
                                onClick={() => {
                                    setQ("");
                                    setWcStatus("all");
                                    setAfter("");
                                    setBefore("");
                                    setPage(1);
                                }}
                            >
                                Limpar
                            </button>
                        </div>
                    </form>

                    {/* Online mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {orders.map((o) => {
                                const cliente = `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || "—";
                                const disabled = !canNotifyRow(o);
                                return (
                                    <div key={o.id} className="rounded-lg border bg-card p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs text-muted-foreground">
                                                Nº <b>{o.number || o.id}</b> • {formatDate(o.date_created)}
                                            </div>
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${clsWcStatusBadge(o.status)}`}>
                                                {WC_STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm">
                                            <div className="font-medium">{cliente}</div>
                                            <div className="mt-1 text-muted-foreground">{formatCurrency(o.total, o.currency || "BRL")}</div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs"
                                                onClick={() => openDetail(o.id)}
                                            >
                                                <IconEye className="size-4" /> Ver
                                            </button>
                                            <button
                                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs disabled:opacity-50"
                                                onClick={() => notifyWhatsApp(o.id)}
                                                disabled={disabled}
                                            >
                                                <IconSend className="size-4" /> Notificar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {!loading && orders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido encontrado.</div>
                            )}
                            {loading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                            {error && <div className="text-sm text-rose-600">{error}</div>}
                        </div>
                    </div>

                    {/* Online desktop */}
                    <div className="hidden flex-1 overflow-auto px-4 pb-6 md:block lg:px-6">
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Nº</th>
                                            <th className="px-3 py-2 font-medium">Data</th>
                                            <th className="px-3 py-2 font-medium">Cliente</th>
                                            <th className="px-3 py-2 font-medium">Total</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map((o) => {
                                            const cliente = `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || "—";
                                            const disabled = !canNotifyRow(o);
                                            return (
                                                <tr key={o.id} className="border-t">
                                                    <td className="px-3 py-2">{o.number || o.id}</td>
                                                    <td className="px-3 py-2">{formatDate(o.date_created)}</td>
                                                    <td className="px-3 py-2">{cliente}</td>
                                                    <td className="px-3 py-2">{formatCurrency(o.total, o.currency || "BRL")}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`rounded-full border px-2 py-0.5 text-xs ${clsWcStatusBadge(o.status)}`}>
                                                            {WC_STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                                                                onClick={() => openDetail(o.id)}
                                                            >
                                                                <IconEye className="size-4" /> Ver
                                                            </button>
                                                            <button
                                                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                                                onClick={() => notifyWhatsApp(o.id)}
                                                                disabled={disabled}
                                                            >
                                                                <IconSend className="size-4" /> Notificar
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!loading && orders.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {loading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                                {error && <div className="px-3 pb-3 text-sm text-rose-600">{error}</div>}
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                                <div className="text-xs text-muted-foreground">
                                    Página {meta.page} de {meta.totalPages} — {meta.total} pedidos
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1 || loading}
                                    >
                                        <IconChevronLeft className="size-4" /> Anterior
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))}
                                        disabled={meta.totalPages ? page >= meta.totalPages || loading : loading}
                                    >
                                        Próxima <IconChevronRight className="size-4" />
                                    </button>
                                    <select
                                        className="rounded-md border bg-background px-2 py-1 text-xs"
                                        value={perPage}
                                        onChange={(e) => {
                                            setPerPage(Number(e.target.value));
                                            setPage(1);
                                        }}
                                    >
                                        {[10, 20, 50, 100].map((n) => (
                                            <option key={n} value={n}>{n} por página</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Modal NOVO */}
            {newOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => !newSaving && setNewOpen(false)} />
                    <form
                        onSubmit={salvarNovoPedido}
                        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl border bg-background shadow-xl"
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-lg font-semibold">Novo Pedido de Coroa</div>
                                <div className="text-xs text-muted-foreground">Pedido manual</div>
                            </div>
                            <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setNewOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Solicitante *</label>
                                <input
                                    value={newForm.solicitante}
                                    onChange={(e) => setNewForm((p) => ({ ...p, solicitante: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Nome do cliente"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Modelo de Coroa *</label>
                                <input
                                    value={newForm.modelo_coroa}
                                    onChange={(e) => setNewForm((p) => ({ ...p, modelo_coroa: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Ex.: Coroa Luxo 01"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Frase *</label>
                                <textarea
                                    value={newForm.frase}
                                    onChange={(e) => setNewForm((p) => ({ ...p, frase: e.target.value }))}
                                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Frase da faixa"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Falecido(a) *</label>
                                <input
                                    list="falecidos-ativos-coroas"
                                    value={newForm.falecido}
                                    onChange={(e) => setNewForm((p) => ({ ...p, falecido: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Selecione do quadro ou digite outro nome"
                                />
                                <datalist id="falecidos-ativos-coroas">
                                    {falecidosQuadro.map((r) => (
                                        <option key={String(r.id || r.falecido)} value={String(r.falecido || "")} />
                                    ))}
                                </datalist>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    A lista traz os falecidos atualmente exibidos no quadro de atendimentos; também é permitido digitar outro nome.
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Status de Pagamento *</label>
                                <select
                                    value={newForm.status_pagamento}
                                    onChange={(e) => setNewForm((p) => ({ ...p, status_pagamento: e.target.value as ManualPagamento }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                >
                                    {PAGAMENTO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Origem *</label>
                                <select
                                    value={newForm.origem}
                                    onChange={(e) => setNewForm((p) => ({ ...p, origem: e.target.value as ManualOrigem }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                >
                                    {ORIGEM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {newError && <div className="sm:col-span-2 text-sm text-rose-600">{newError}</div>}
                        </div>
                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setNewOpen(false)} disabled={newSaving}>
                                Cancelar
                            </button>
                            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={newSaving}>
                                {newSaving ? "Salvando..." : "Criar Pedido"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Drawer manual */}
            {manualDetailOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setManualDetailOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-background shadow-xl md:max-w-2xl">
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Pedido manual</div>
                                <div className="text-lg font-semibold">#{manualDetail?.id || "—"}</div>
                            </div>
                            <button className="rounded-md p-2 hover:bg-muted" onClick={() => setManualDetailOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {manualDetailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : manualDetail ? (
                            <div className="space-y-4 p-4">
                                <div className="rounded-lg border p-3">
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-xs ${manualStatusClass(manualDetail.status)}`}>
                                            {manualStatusLabel(manualDetail.status)}
                                        </span>
                                        <span className={`rounded-full border px-2 py-0.5 text-xs ${pagamentoClass(manualDetail.status_pagamento)}`}>
                                            {pagamentoLabel(manualDetail.status_pagamento)}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                        <div><b>Solicitante:</b> {manualDetail.solicitante}</div>
                                        <div><b>Origem:</b> {origemLabel(manualDetail.origem)}</div>
                                        <div><b>Modelo:</b> {manualDetail.modelo_coroa}</div>
                                        <div><b>Falecido(a):</b> {manualDetail.falecido}</div>
                                        <div className="sm:col-span-2"><b>Frase:</b> {manualDetail.frase}</div>
                                        <div className="sm:col-span-2 text-xs text-muted-foreground">
                                            Criado em {formatDate(manualDetail.criado_em)} {manualDetail.criado_por ? `por ${manualDetail.criado_por}` : ""}
                                        </div>
                                    </div>
                                </div>

                                {/* Pagamento */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 font-medium">Pagamento</div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                        <div className="flex-1">
                                            <label className="mb-1 block text-xs font-medium">Status</label>
                                            <select
                                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                value={manualDetail.status_pagamento}
                                                disabled={manualActionLoading}
                                                onChange={(e) => atualizarPagamentoManual(e.target.value as ManualPagamento)}
                                            >
                                                {PAGAMENTO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex-1">
                                            <div className="mb-1 text-xs font-medium">Comprovante</div>
                                            <ImageUploadButtons disabled={manualActionLoading} onFile={(f) => anexarFotoManual("comprovante", f)} />
                                        </div>
                                    </div>
                                    {manualDetail.comprovante_url && (
                                        <a href={manualDetail.comprovante_url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-lg border">
                                            <img src={manualDetail.comprovante_url} alt="Comprovante" className="max-h-72 w-full object-contain bg-muted/20" />
                                        </a>
                                    )}
                                </div>

                                {/* Foto da coroa */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-1 font-medium">Foto da Coroa Pronta</div>
                                    <div className="mb-3 text-xs text-muted-foreground">
                                        Esta foto é obrigatória antes do comando <b>Finalizada</b>.
                                    </div>
                                    <ImageUploadButtons disabled={manualActionLoading} onFile={(f) => anexarFotoManual("coroa", f)} />
                                    {manualDetail.foto_coroa_url && (
                                        <a href={manualDetail.foto_coroa_url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-lg border">
                                            <img src={manualDetail.foto_coroa_url} alt="Coroa pronta" className="max-h-96 w-full object-contain bg-muted/20" />
                                        </a>
                                    )}
                                </div>

                                {/* Fluxo */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-3 font-medium">Ações de Confecção</div>
                                    <div className="mb-3 grid grid-cols-4 gap-2 text-center text-[10px] sm:text-xs">
                                        {([
                                            ["coroa", "Coroa"],
                                            ["faixa", "Faixa"],
                                            ["finalizada", "Finalizada"],
                                            ["entregue", "Entregue"],
                                        ] as const).map(([key, label]) => {
                                            const rank: Record<ManualStatus, number> = { novo: 0, coroa: 1, faixa: 2, finalizada: 3, entregue: 4 };
                                            const done = rank[manualDetail.status] >= rank[key];
                                            return (
                                                <div key={key} className={`rounded-md border px-2 py-2 ${done ? "bg-emerald-50 border-emerald-200" : "bg-muted/20"}`}>
                                                    {label}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {manualDetail.status !== "entregue" ? (
                                        <button
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={
                                                manualActionLoading ||
                                                (proximoStatusManual(manualDetail.status) === "finalizada" && !manualDetail.foto_coroa_url)
                                            }
                                            onClick={executarProximaAcaoManual}
                                            title={
                                                proximoStatusManual(manualDetail.status) === "finalizada" && !manualDetail.foto_coroa_url
                                                    ? "Anexe a foto da coroa pronta antes de finalizar."
                                                    : "Confirmar próxima etapa"
                                            }
                                        >
                                            <IconCheck className="size-4" />
                                            {proximaAcaoLabel(manualDetail.status)}
                                        </button>
                                    ) : (
                                        <div className="rounded-md bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-800">
                                            Pedido entregue — fluxo concluído.
                                        </div>
                                    )}

                                    {proximoStatusManual(manualDetail.status) === "finalizada" && !manualDetail.foto_coroa_url && (
                                        <div className="mt-2 text-xs text-amber-700">
                                            Anexe a foto da coroa pronta para liberar o comando Finalizada.
                                        </div>
                                    )}
                                </div>

                                {manualDetailMsg && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{manualDetailMsg}</div>}
                            </div>
                        ) : (
                            <div className="p-4 text-sm text-rose-600">{manualDetailMsg || "Pedido não encontrado."}</div>
                        )}
                    </div>
                </div>
            )}

            {/* Drawer online — mantém a experiência existente */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-white shadow-xl md:max-w-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Pedido</div>
                                <div className="text-lg font-semibold">#{detail?.number || detail?.id || "—"}</div>
                            </div>
                            <button className="rounded-md p-2 hover:bg-muted" onClick={() => setOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {!detail || detailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : (
                            <div className="space-y-4 p-4">
                                {detailImage && (
                                    <div className="overflow-hidden rounded-lg border bg-white">
                                        <img src={detailImage} alt={detail.line_items?.[0]?.name || "Produto"} className="w-full object-cover" />
                                    </div>
                                )}
                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <div><b>Pedido:</b> {detail.line_items?.map((i) => i.name).filter(Boolean).join(", ") || `#${detail.number || detail.id}`}</div>
                                    <div><b>Origem:</b> Loja On-line</div>
                                    <div><b>Cliente:</b> {(detail.billing?.first_name || "") + " " + (detail.billing?.last_name || "")}</div>
                                    <div><b>Telefone:</b> {detail.billing?.phone || "—"}</div>
                                    <div><b>Valor:</b> {formatCurrency(detail.total, detail.currency || "BRL")}</div>
                                    <div><b>Local de Entrega:</b> {[detail.shipping?.address_1, detail.shipping?.address_2].filter(Boolean).join(" - ") || "—"}</div>
                                    <div>
                                        <b>Falecido(a):</b>{" "}
                                        {findMetaValue(detail.meta_data, ["shipping_falecido_nome", "falecido_nome", "nome_falecido", "nome_do_falecido"]) || detail.shipping?.first_name || "—"}
                                    </div>
                                    <div>
                                        <b>Frase da Coroa:</b>{" "}
                                        {findMetaValue(detail.meta_data, ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
                                            findMetaValue(detail.line_items?.flatMap((li) => li.meta_data || []), ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
                                            "—"}
                                    </div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className={`w-fit rounded-full border px-2 py-0.5 text-xs ${clsWcStatusBadge(detail.status)}`}>
                                            {WC_STATUS_OPTIONS.find((s) => s.value === detail.status)?.label ?? detail.status}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {(["processing", "completed", "cancelled", "on-hold"] as const).map((s) => (
                                                <button
                                                    key={s}
                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                                    onClick={() => updateStatus(detail.id, s)}
                                                    disabled={updating || detail.status === s}
                                                >
                                                    <IconCheck className="size-4" />
                                                    {WC_STATUS_OPTIONS.find((o) => o.value === s)?.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Criado em {formatDate(detail.date_created)} — Total <b>{formatCurrency(detail.total, detail.currency || "BRL")}</b>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={copyDetailToClipboard}>
                                        <IconCopy className="size-4" /> {copied ? "Copiado!" : "Copiar Pedido"}
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                        onClick={() => detailImage && shareImageUrl(detailImage)}
                                        disabled={!detailImage}
                                    >
                                        <IconPhoto className="size-4" /> Compartilhar Foto
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                        onClick={() => detail && notifyWhatsApp(detail.id)}
                                        disabled={!canNotifyDetail}
                                        title={canNotifyDetail ? "Compartilhar mensagem" : "Só é possível notificar pedidos Concluídos."}
                                    >
                                        <IconSend className="size-4" /> Notificar (WhatsApp)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
