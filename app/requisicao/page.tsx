"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    IconClipboardPlus,
    IconClipboardList,
    IconChartBar,
    IconPackage,
    IconTruckDelivery,
} from "@tabler/icons-react";

/* ========= API ========= */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

type ID = number;

type StatusId = "PENDENTE" | "EM_TRANSITO";

type ReqListRow = {
    id: ID;
    codigo?: string | null;
    status: StatusId | string;
    status_label?: string | null;
    solicitante_nome?: string | null;
    unidade_destino_nome?: string | null;
    unidade_destino_texto?: string | null;
    id_atendimento?: string | null;
    itens_resumo?: string | null;
    total_itens?: number | string;
    total_quantidade?: number | string;
    criado_em: string;
    enviado_em?: string | null;
    atrasada_24h?: 0 | 1 | number | string;
};

type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada. ${txt ? txt.slice(0, 180) : ""}`.trim()
        );
    }

    return (await r.json()) as T;
}

async function apiGet<T>(
    qs: Record<string, string | number | boolean | undefined>
) {
    const u = new URL(API_BASE);

    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined || v === "") return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return safeJson<T>(r);
}

/* ========= Ícone circular padrão global do app ========= */
function QuickIcon({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="
                grid h-11 w-11 place-items-center rounded-full
                bg-sky-100 text-sky-700
                transition-colors
                group-hover:bg-sky-600 group-hover:text-white
                dark:bg-sky-900/30 dark:text-sky-200
                dark:group-hover:bg-sky-600
            "
        >
            {children}
        </span>
    );
}

/* ========= ITENS ========= */
const items = [
    {
        title: "Solicitar Produto",
        href: "/solicitar-produto",
        icon: IconClipboardPlus,
    },
    {
        title: "Minhas Solicitações",
        href: "/minhas-solicitacoes",
        icon: IconClipboardList,
    },
    {
        title: "Requisições",
        href: "/requisicoes",
        icon: IconClipboardList,
    },
    {
        title: "Dashboard Requisições",
        href: "/dashboard-requisicoes",
        icon: IconChartBar,
    },
];

function toStatus(v: unknown): StatusId {
    const s = String(v || "").toUpperCase();

    if (s === "EM_TRANSITO") return "EM_TRANSITO";

    return "PENDENTE";
}

function statusLabel(v: unknown) {
    const s = toStatus(v);

    if (s === "EM_TRANSITO") return "Em trânsito";

    return "Pendente";
}

function statusClass(v: unknown) {
    const s = toStatus(v);

    if (s === "EM_TRANSITO") {
        return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200";
    }

    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
}

function isTruthy(v: unknown) {
    return (
        v === 1 ||
        v === "1" ||
        v === true ||
        String(v).toLowerCase() === "true"
    );
}

function fmtDateTime(value?: string | null) {
    if (!value) return "-";

    try {
        const normalized = String(value).includes("T")
            ? String(value)
            : String(value).replace(" ", "T");

        const d = new Date(normalized);

        if (Number.isNaN(d.getTime())) return String(value);

        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(d);
    } catch {
        return String(value);
    }
}

function destinationText(row?: ReqListRow | null) {
    if (!row) return "-";

    return row.unidade_destino_nome || row.unidade_destino_texto || "-";
}

function reqCode(row?: ReqListRow | null) {
    if (!row) return "REQ";

    return row.codigo || `REQ-${row.id}`;
}

function RequestStatusBadge({ status }: { status: unknown }) {
    return (
        <span
            className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black",
                statusClass(status),
            ].join(" ")}
        >
            {statusLabel(status)}
        </span>
    );
}

function RequestCard({ row }: { row: ReqListRow }) {
    const solicitante = row.solicitante_nome || "Solicitante não informado";

    return (
        <Link
            href="/requisicoes"
            className="
                group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm
                transition-all hover:-translate-y-[1px] hover:shadow-md
                dark:border-gray-800 dark:bg-gray-900
                lg:col-span-3
            "
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-gray-950 dark:text-white">
                            {reqCode(row)}
                        </span>

                        <RequestStatusBadge status={row.status} />

                        {isTruthy(row.atrasada_24h) ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                                +24h
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-4 max-w-md rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/30">
                        <p className="text-[11px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">
                            Solicitante
                        </p>

                        <p className="mt-1 truncate text-2xl font-black tracking-tight text-sky-950 dark:text-white">
                            {solicitante}
                        </p>
                    </div>
                </div>

                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-700 transition-colors group-hover:bg-sky-600 group-hover:text-white dark:bg-gray-800 dark:text-gray-200">
                    <IconTruckDelivery size={23} />
                </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                <p className="line-clamp-2 font-black text-gray-900 dark:text-white sm:col-span-2">
                    {row.itens_resumo || "Itens não informados"}
                </p>

                <p>
                    Destino:{" "}
                    <b className="text-gray-900 dark:text-white">
                        {destinationText(row)}
                    </b>
                </p>

                <p>
                    Aberta em:{" "}
                    <b className="text-gray-900 dark:text-white">
                        {fmtDateTime(row.criado_em)}
                    </b>
                </p>

                {row.id_atendimento ? (
                    <p>
                        Atendimento:{" "}
                        <b className="text-gray-900 dark:text-white">
                            {row.id_atendimento}
                        </b>
                    </p>
                ) : null}

                {row.enviado_em ? (
                    <p>
                        Enviada em:{" "}
                        <b className="text-gray-900 dark:text-white">
                            {fmtDateTime(row.enviado_em)}
                        </b>
                    </p>
                ) : null}
            </div>
        </Link>
    );
}

export default function RequisicaoPage() {
    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadRequisicoes = useCallback(async () => {
        setError("");

        try {
            const data = await apiGet<ListResp>({
                action: "fila",
                status: "PENDENTE,EM_TRANSITO",
                limit: 50,
            });

            if (!data.ok) {
                throw new Error(data.msg || "Não foi possível carregar as requisições.");
            }

            setRows(data.rows || []);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar requisições.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRequisicoes();

        const timer = window.setInterval(() => {
            void loadRequisicoes();
        }, 30000);

        return () => window.clearInterval(timer);
    }, [loadRequisicoes]);

    const requisicoesAbertas = useMemo(() => {
        return rows.filter((row) => {
            const status = String(row.status || "").toUpperCase();

            return status === "PENDENTE" || status === "EM_TRANSITO";
        });
    }, [rows]);

    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">
                {/* HEADER */}
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconPackage className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Requisição de Material
                        </h1>
                    </div>
                </header>

                {/* ========= REQUISIÇÕES PENDENTES / EM TRÂNSITO ========= */}
                <section className="mb-5">
                    {loading ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:col-span-3">
                                Carregando requisições...
                            </div>
                        </div>
                    ) : error ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-800 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 lg:col-span-3">
                                {error}
                            </div>
                        </div>
                    ) : requisicoesAbertas.length ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            {requisicoesAbertas.map((row) => (
                                <RequestCard key={row.id} row={row} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:col-span-3">
                                Nenhuma requisição pendente ou em trânsito no momento.
                            </div>
                        </div>
                    )}
                </section>

                {/* ========= GRID PADRÃO APP ========= */}
                <section>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map(({ title, href, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className="
                                    group flex flex-col items-center justify-center
                                    gap-2.5
                                    rounded-2xl
                                    border border-gray-200
                                    bg-white
                                    px-3 py-4
                                    shadow-sm
                                    transition-all
                                    hover:-translate-y-[1px]
                                    hover:shadow-md
                                    dark:border-gray-800 dark:bg-gray-900
                                "
                            >
                                <QuickIcon>
                                    <Icon size={22} />
                                </QuickIcon>

                                <span
                                    className="
                                        text-center
                                        text-[13px]
                                        font-extrabold
                                        leading-tight
                                        tracking-tight
                                        text-gray-900
                                        dark:text-white
                                    "
                                >
                                    {title}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}