"use client";

import * as React from "react";
import {
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconEye,
    IconRefresh,
    IconSearch,
    IconSend,
    IconX,
    IconCopy,
    IconPhoto,
} from "@tabler/icons-react";

/* =========================
   Tipos
   ========================= */
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
    date_created: string; // ISO
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
        first_name?: string; // Falecido(a)
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
        image?: { id: number | string; src: string }; // imagem pode vir no pedido
    }>;
    shipping_lines?: Array<{
        id: number;
        method_title: string;
        total: string;
    }>;
};

type OrdersResponse = {
    data: WcOrder[];
    meta: { page: number; per_page: number; total: number; totalPages: number };
};

/* =========================
   Utils
   ========================= */
const STATUS_OPTIONS: Array<{ value: WcOrder["status"] | "all"; label: string }> = [
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
    if (Number.isNaN(num)) return v + "";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
}

function formatDate(iso: string) {
    try {
        const dt = new Date(iso);
        return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function clsStatusBadge(s: WcOrder["status"]) {
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

/** Texto com quebras de linha "fortes" e linha em branco entre blocos */
function buildWhatsAppText(order: WcOrderFull) {
    const NL = "\r\n"; // força quebra em vários apps (iOS/Android/Web)
    const itens = (order.line_items || []).map((i) => i.name).filter(Boolean);
    const pedidoNome = itens.join(", ");

    const cliente = `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim();
    const phone = onlyDigits(order.billing?.phone);
    const valor = formatCurrency(order.total, order.currency || "BRL");
    const localEntrega = [order.shipping?.address_1, order.shipping?.address_2].filter(Boolean).join(" - ");
    const falecido = order.shipping?.first_name || "";

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

    const linhas: string[] = [];
    const push = (s: string) => {
        linhas.push(s);
        linhas.push(""); // linha em branco
    };

    push(`*Pedido:* ${pedidoNome || `#${order.number || order.id}`}`);
    push(`*Origem:* Loja On-line`);
    push(`*Cliente:* ${cliente || "—"}`);
    push(`*Telefone:* ${phone || "—"}`);
    push(`*Valor:* ${valor}`);
    push(`*Local de Entrega:* ${localEntrega || "—"}`);
    push(`*Falecido(a):* ${falecido || "—"}`);
    push(`*Frase da Coroa:* ${frase || "—"}`);
    push(`*Comprovante de pagamento:*`);

    // usa CRLF entre todas as linhas
    return linhas.join(NL);
}

/** compartilhar/abrir WhatsApp (texto) */
async function shareOrOpenWhatsApp(text: string, toPhone?: string) {
    const phone = onlyDigits(toPhone);

    if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
            await (navigator as any).share({ text });
            return;
        } catch {
            /* continue */
        }
    }

    const encoded = encodeURIComponent(text);
    const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(
        (typeof navigator !== "undefined" && navigator.userAgent) || ""
    );
    const deep =
        phone && isMobile ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
    const opened = window.open(deep, "_blank");
    if (opened) return;

    const webUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`;
    const openedWeb = window.open(webUrl, "_blank", "noopener,noreferrer");
    if (openedWeb) return;

    try {
        await navigator.clipboard.writeText(text);
    } catch { }
    window.open(phone ? `https://wa.me/${phone}` : `https://web.whatsapp.com/`, "_blank");
}

/** Converte um Blob de imagem (PNG com transparência, etc.) em JPEG com fundo branco */
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
        const out: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.92)!);
        return out;
    } finally {
        URL.revokeObjectURL(imgUrl);
    }
}

/** Compartilhar imagem (tenta baixar, compor em fundo branco e compartilhar como arquivo) */
async function shareImageUrl(imageUrl: string) {
    if (!imageUrl) return;

    // 1) Web Share com arquivo (necessita CORS permitido na URL)
    try {
        const resp = await fetch(imageUrl, { mode: "cors", cache: "no-store" });
        if (resp.ok) {
            let blob = await resp.blob();
            // Se for PNG com transparência, convertemos para JPEG com fundo branco
            try {
                if (blob.type === "image/png") {
                    blob = await convertToJpegWithWhiteBg(blob);
                }
            } catch {
                // se der algo errado, segue com o blob original
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
        // segue para fallback
    }

    // 2) Compartilhar a URL (se o app aceitar)
    try {
        const navAny = navigator as any;
        if (navAny.share) {
            await navAny.share({ url: imageUrl });
            return;
        }
    } catch { }

    // 3) Último recurso: abrir em nova aba
    window.open(imageUrl, "_blank", "noopener,noreferrer");
}

/* =========================
   Página
   ========================= */
export const dynamic = "force-dynamic";

export default function Page() {
    // filtros/estado
    const [q, setQ] = React.useState("");
    const [status, setStatus] = React.useState<"all" | WcOrder["status"]>("all");
    const [after, setAfter] = React.useState<string>("");
    const [before, setBefore] = React.useState<string>("");

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

    // detalhe
    const [open, setOpen] = React.useState(false);
    const [detail, setDetail] = React.useState<WcOrderFull | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailImage, setDetailImage] = React.useState<string | null>(null);

    // feedback de cópia
    const [copied, setCopied] = React.useState(false);

    // atualização de status
    const [updating, setUpdating] = React.useState(false);

    async function fetchOrders() {
        setLoading(true);
        setError(null);
        try {
            const u = new URL("/api/wc/orders", window.location.origin);
            u.searchParams.set("page", String(page));
            u.searchParams.set("per_page", String(perPage));
            if (q.trim()) u.searchParams.set("search", q.trim());
            if (status !== "all") u.searchParams.set("status", status);
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
    }

    React.useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, perPage]);

    function onSubmitFilters(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);
        fetchOrders();
    }

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

            // 1) imagem que já vem no pedido
            const fromOrder = data.line_items?.find((li) => li.image?.src)?.image?.src || null;
            if (fromOrder) {
                setDetailImage(fromOrder);
            } else {
                // 2) fallback: produto/variação
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
                    } catch { }
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
            } as any);
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
                throw new Error(msg || `Falha ao atualizar status`);
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
            const text = buildWhatsAppText(full);
            await shareOrOpenWhatsApp(text);
        } catch (e: any) {
            alert(e?.message || "Não foi possível abrir o WhatsApp.");
        }
    }

    async function copyDetailToClipboard() {
        try {
            if (!detail) return;
            const text = buildWhatsAppText(detail);
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            alert("Não foi possível copiar o texto.");
        }
    }

    async function shareDetailPhoto() {
        if (!detailImage) {
            alert("Este pedido não tem imagem de produto disponível.");
            return;
        }
        await shareImageUrl(detailImage);
    }

    const canNotifyRow = (o: WcOrder) => o.status === "completed";
    const canNotifyDetail = detail?.status === "completed";

    /* ===== Render ===== */
    return (
        <div className="flex h-full flex-col">
            {/* Cabeçalho local */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
                <div>
                    <h1 className="text-xl font-semibold">Pedidos — Coroas de Flores</h1>
                    <p className="text-sm text-muted-foreground">Pesquise, filtre, visualize e gerencie pedidos do WooCommerce.</p>
                </div>
                <button
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => fetchOrders()}
                    disabled={loading}
                    title="Recarregar"
                >
                    <IconRefresh className="size-4" />
                    Atualizar
                </button>
            </div>

            {/* Filtros */}
            <form
                onSubmit={onSubmitFilters}
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
                        className="w-full rounded-md border bg-background py-2 px-2 text-sm outline-none"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                    >
                        {STATUS_OPTIONS.map((o) => (
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
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                        disabled={loading}
                    >
                        <IconSearch className="size-4" />
                        Buscar
                    </button>
                    <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm"
                        onClick={() => {
                            setQ("");
                            setStatus("all");
                            setAfter("");
                            setBefore("");
                            setPage(1);
                            fetchOrders();
                        }}
                    >
                        Limpar
                    </button>
                </div>
            </form>

            {/* Lista MOBILE (cards) */}
            <div className="px-4 pb-6 lg:px-6 md:hidden">
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
                                    <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${clsStatusBadge(
                                            o.status
                                        )}`}
                                    >
                                        {STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                    </span>
                                </div>

                                <div className="mt-2 text-sm">
                                    <div className="font-medium leading-tight">{cliente}</div>
                                    <div className="text-muted-foreground mt-1">{formatCurrency(o.total, o.currency || "BRL")}</div>
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={() => openDetail(o.id)}
                                        title="Ver detalhes"
                                    >
                                        <IconEye className="size-4" />
                                        Ver
                                    </button>
                                    <button
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
                                        onClick={() => notifyWhatsApp(o.id)}
                                        disabled={disabled}
                                        title={disabled ? "Só é possível notificar pedidos Concluídos." : "Enviar via WhatsApp"}
                                    >
                                        <IconSend className="size-4" />
                                        Notificar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {!loading && orders.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground">Nenhum pedido encontrado.</div>
                    )}
                    {loading && <div className="text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                    {error && <div className="text-rose-600 text-sm">{error}</div>}
                </div>

                {/* paginação (mobile) */}
                <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">Página {meta.page} de {meta.totalPages}</div>
                    <div className="flex items-center gap-2">
                        <button
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1 || loading}
                        >
                            <IconChevronLeft className="size-4" />
                            Anterior
                        </button>
                        <button
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                            onClick={() => setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))}
                            disabled={meta.totalPages ? page >= meta.totalPages || loading : loading}
                        >
                            Próxima
                            <IconChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabela DESKTOP */}
            <div className="hidden md:block flex-1 overflow-auto px-4 pb-6 lg:px-6">
                <div className="overflow-hidden rounded-lg border bg-card">
                    <div className="relative overflow-x-auto">
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
                                {orders.length === 0 && !loading && (
                                    <tr>
                                        <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                                            Nenhum pedido encontrado.
                                        </td>
                                    </tr>
                                )}

                                {orders.map((o) => {
                                    const cliente = `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || "—";
                                    const disabled = !canNotifyRow(o);
                                    const reason = disabled ? "Só é possível notificar pedidos Concluídos." : "Enviar via WhatsApp";
                                    return (
                                        <tr key={o.id} className="border-t">
                                            <td className="px-3 py-2">{o.number || o.id}</td>
                                            <td className="px-3 py-2">{formatDate(o.date_created)}</td>
                                            <td className="px-3 py-2">{cliente}</td>
                                            <td className="px-3 py-2">{formatCurrency(o.total, o.currency || "BRL")}</td>
                                            <td className="px-3 py-2">
                                                <span
                                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(
                                                        o.status
                                                    )}`}
                                                >
                                                    {STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                        onClick={() => openDetail(o.id)}
                                                        title="Ver detalhes"
                                                    >
                                                        <IconEye className="size-4" />
                                                        Ver
                                                    </button>

                                                    <button
                                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                                        onClick={() => notifyWhatsApp(o.id)}
                                                        title={reason}
                                                        disabled={disabled}
                                                    >
                                                        <IconSend className="size-4" />
                                                        Notificar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {loading && (
                            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                                Carregando pedidos…
                            </div>
                        )}
                        {error && <div className="px-3 pb-3 text-sm text-rose-600">{error}</div>}
                    </div>

                    {/* Paginação (desktop) */}
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
                                <IconChevronLeft className="size-4" />
                                Anterior
                            </button>
                            <button
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() => setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))}
                                disabled={meta.totalPages ? page >= meta.totalPages || loading : loading}
                            >
                                Próxima
                                <IconChevronRight className="size-4" />
                            </button>
                            <select
                                className="rounded-md border bg-background px-2 py-1 text-xs outline-none"
                                value={perPage}
                                onChange={(e) => {
                                    setPerPage(Number(e.target.value));
                                    setPage(1);
                                }}
                            >
                                {[10, 20, 50, 100].map((n) => (
                                    <option key={n} value={n}>
                                        {n} por página
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detalhe */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-0 h-full w-full md:max-w-xl overflow-auto bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Pedido</div>
                                <div className="text-lg font-semibold">#{detail?.number || detail?.id || "—"}</div>
                            </div>
                            <button className="rounded-md p-2 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Fechar">
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {!detail || detailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : (
                            <div className="space-y-4 p-4">
                                {/* Imagem do item */}
                                {detailImage && (
                                    <div className="overflow-hidden rounded-lg border bg-white">
                                        {/* bg-white ajuda a simular o fundo já aqui */}
                                        <img
                                            src={detailImage}
                                            alt={detail.line_items?.[0]?.name || "Produto"}
                                            className="w-full object-cover"
                                        />
                                    </div>
                                )}

                                {/* Texto formatado do pedido */}
                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <div>
                                        <b>Pedido:</b>{" "}
                                        {detail.line_items?.map((i) => i.name).filter(Boolean).join(", ") ||
                                            `#${detail.number || detail.id}`}
                                    </div>
                                    <div>
                                        <b>Origem:</b> Loja On-line
                                    </div>
                                    <div>
                                        <b>Cliente:</b> {(detail.billing?.first_name || "") + " " + (detail.billing?.last_name || "")}
                                    </div>
                                    <div>
                                        <b>Telefone:</b> {detail.billing?.phone || "—"}
                                    </div>
                                    <div>
                                        <b>Valor:</b> {formatCurrency(detail.total, detail.currency || "BRL")}
                                    </div>
                                    <div>
                                        <b>Local de Entrega:</b>{" "}
                                        {[detail.shipping?.address_1, detail.shipping?.address_2].filter(Boolean).join(" - ") || "—"}
                                    </div>
                                    <div>
                                        <b>Falecido(a):</b> {detail.shipping?.first_name || "—"}
                                    </div>
                                    <div>
                                        <b>Frase da Coroa:</b>{" "}
                                        {findMetaValue(detail.meta_data, [
                                            "frase_para_a_faixa",
                                            "frase da coroa",
                                            "frase da faixa",
                                            "faixa",
                                            "mensagem",
                                        ]) ||
                                            findMetaValue(
                                                detail.line_items?.flatMap((li) => li.meta_data || []),
                                                ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]
                                            ) ||
                                            "—"}
                                    </div>
                                </div>

                                {/* Status + ações rápidas */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span
                                            className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(
                                                detail.status
                                            )}`}
                                        >
                                            {STATUS_OPTIONS.find((s) => s.value === detail.status)?.label ?? detail.status}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {(["processing", "completed", "cancelled", "on-hold"] as const).map((s) => (
                                                <button
                                                    key={s}
                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                                    onClick={() => updateStatus(detail.id, s)}
                                                    disabled={updating || detail.status === s}
                                                >
                                                    <IconCheck className="size-4" />
                                                    {STATUS_OPTIONS.find((o) => o.value === s)?.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="text-sm text-muted-foreground">
                                        Criado em {formatDate(detail.date_created)} — Total{" "}
                                        <b>{formatCurrency(detail.total, detail.currency || "BRL")}</b>
                                    </div>
                                </div>

                                {/* Ações */}
                                <div className="flex flex-wrap gap-2">
                                    {/* Copiar Pedido */}
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={copyDetailToClipboard}
                                        title="Copiar texto do pedido"
                                    >
                                        <IconCopy className="size-4" />
                                        {copied ? "Copiado!" : "Copiar Pedido"}
                                    </button>

                                    {/* Compartilhar Foto */}
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                                        onClick={shareDetailPhoto}
                                        disabled={!detailImage}
                                        title={
                                            detailImage
                                                ? "Abrir compartilhamento com a foto do produto"
                                                : "Este pedido não tem imagem de produto"
                                        }
                                    >
                                        <IconPhoto className="size-4" />
                                        Compartilhar Foto
                                    </button>

                                    {/* Notificar (WhatsApp) */}
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                                        onClick={() => detail && notifyWhatsApp(detail.id)}
                                        disabled={!canNotifyDetail}
                                        title={
                                            canNotifyDetail
                                                ? "Compartilhar mensagem e escolher o WhatsApp"
                                                : "Só é possível notificar pedidos Concluídos."
                                        }
                                    >
                                        <IconSend className="size-4" />
                                        Notificar (WhatsApp)
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
