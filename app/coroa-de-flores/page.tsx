"use client";

import * as React from "react";
import {
    IconBell,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconEye,
    IconFilter,
    IconRefresh,
    IconSearch,
    IconSend,
    IconX,
} from "@tabler/icons-react";

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
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
    };
};

type WcOrderFull = WcOrder & {
    line_items?: Array<{
        id: number;
        name: string;
        quantity: number;
        total: string;
        price?: string;
        sku?: string;
        meta_data?: Array<{ key: string; value: string }>;
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

export const dynamic = "force-dynamic";

export default function Page() {
    // filtros/estado
    const [q, setQ] = React.useState("");
    const [status, setStatus] = React.useState<"all" | WcOrder["status"]>("all");
    const [after, setAfter] = React.useState<string>(""); // yyyy-mm-dd
    const [before, setBefore] = React.useState<string>(""); // yyyy-mm-dd

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
                // incluir dia inteiro até 23:59:59
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
    }, [page, perPage]); // filtros textuais/datas acionam

    function onSubmitFilters(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);
        fetchOrders();
    }

    async function openDetail(id: number) {
        setDetail(null);
        setOpen(true);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Falha ao carregar pedido #${id}`);
            const data: WcOrderFull = await res.json();
            setDetail(data);
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
            // refresh lista e detalhe
            await fetchOrders();
            if (detail?.id === id) await openDetail(id);
        } catch (e: any) {
            alert(e?.message || "Não foi possível atualizar o status.");
        } finally {
            setUpdating(false);
        }
    }

    async function notifyTeam(order: WcOrder) {
        try {
            const res = await fetch("/api/push/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: order.id,
                    number: order.number,
                    total: order.total,
                    currency: order.currency,
                    customer: `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim(),
                    status: order.status,
                }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || "Falha ao notificar");
            }
            alert("Equipe notificada com sucesso!");
        } catch (e: any) {
            // Caso não exista o endpoint ainda, não quebra a página
            alert(e?.message || "Não foi possível enviar a notificação (verifique /api/push/order).");
        }
    }

    return (
        <div className="flex h-full flex-col">
            {/* Cabeçalho local */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
                <div>
                    <h1 className="text-xl font-semibold">Pedidos — Coroas de Flores</h1>
                    <p className="text-sm text-muted-foreground">
                        Pesquise, filtre, visualize e gerencie pedidos do WooCommerce.
                    </p>
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
                    <div className="relative">
                        <IconFilter className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                        <select
                            className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
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

            {/* Tabela */}
            <div className="flex-1 overflow-auto px-4 pb-6 lg:px-6">
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
                                    return (
                                        <tr key={o.id} className="border-t">
                                            <td className="px-3 py-2">{o.number || o.id}</td>
                                            <td className="px-3 py-2">{formatDate(o.date_created)}</td>
                                            <td className="px-3 py-2">{cliente}</td>
                                            <td className="px-3 py-2">{formatCurrency(o.total, o.currency || "BRL")}</td>
                                            <td className="px-3 py-2">
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(o.status)}`}>
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
                                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                        onClick={() => notifyTeam(o)}
                                                        title="Notificar equipe"
                                                    >
                                                        <IconBell className="size-4" />
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
                        {error && (
                            <div className="px-3 pb-3 text-sm text-rose-600">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Paginação */}
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

            {/* Drawer de Detalhes */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setOpen(false)}
                        aria-hidden
                    />
                    <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Pedido</div>
                                <div className="text-lg font-semibold">
                                    #{detail?.number || detail?.id || "—"}
                                </div>
                            </div>
                            <button
                                className="rounded-md p-2 hover:bg-muted"
                                onClick={() => setOpen(false)}
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {!detail || detailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : (
                            <div className="space-y-4 p-4">
                                {/* Status + ações */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(detail.status)}`}>
                                            {STATUS_OPTIONS.find((s) => s.value === detail.status)?.label ?? detail.status}
                                        </span>
                                        <div className="flex items-center gap-2">
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

                                {/* Cliente */}
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-lg border p-3">
                                        <div className="mb-2 text-sm font-medium">Cliente</div>
                                        <div className="text-sm">
                                            <div>
                                                {detail.billing?.first_name} {detail.billing?.last_name}
                                            </div>
                                            <div className="text-muted-foreground">{detail.billing?.email}</div>
                                            <div className="text-muted-foreground">{detail.billing?.phone}</div>
                                        </div>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <div className="mb-2 text-sm font-medium">Entrega</div>
                                        <div className="text-sm text-muted-foreground">
                                            <div>{detail.shipping?.address_1}</div>
                                            <div>{detail.shipping?.address_2}</div>
                                            <div>
                                                {detail.shipping?.city} {detail.shipping?.state} {detail.shipping?.postcode}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Itens */}
                                <div className="rounded-lg border">
                                    <div className="border-b px-3 py-2 text-sm font-medium">Itens</div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-muted/50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                                                    <th className="px-3 py-2 text-left font-medium">Qtd</th>
                                                    <th className="px-3 py-2 text-left font-medium">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.line_items?.map((li) => (
                                                    <tr key={li.id} className="border-t">
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium">{li.name}</div>
                                                            {!!li.meta_data?.length && (
                                                                <div className="mt-1 text-xs text-muted-foreground">
                                                                    {li.meta_data.map((m, i) => (
                                                                        <div key={i}>
                                                                            <b>{m.key}:</b> {String(m.value)}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2">{li.quantity}</td>
                                                        <td className="px-3 py-2">{formatCurrency(li.total, detail.currency || "BRL")}</td>
                                                    </tr>
                                                ))}
                                                {!detail.line_items?.length && (
                                                    <tr>
                                                        <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={3}>
                                                            Nenhum item.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Ações rápidas */}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={() =>
                                            notifyTeam(detail)
                                        }
                                    >
                                        <IconSend className="size-4" />
                                        Notificar equipe
                                    </button>
                                    <a
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        href={`/api/wc/orders/${detail.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <IconEye className="size-4" />
                                        Ver JSON bruto
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
