"use client";

import * as React from "react";
import {
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconCopy,
    IconEye,
    IconRefresh,
    IconSearch,
    IconSend,
    IconX,
} from "@tabler/icons-react";

/* =========================
   Config
   ========================= */

const CADASTROS_PLANOS_API_URL =
    "https://planoassistencialintegrado.com.br/cadastros-planos.php";

/* =========================
   Tipos
   ========================= */

type PlanoTipo = "FLEX" | "LIGHT" | "PLUS";

type StatusPagamento =
    | "AGUARDANDO_PAGAMENTO"
    | "PAGO"
    | "RECUSADO"
    | "CANCELADO"
    | "EXPIRADO"
    | "ESTORNADO";

type Dependente = {
    nome?: string;
    name?: string;
    nascimento?: string;
    birth?: string;
    parentesco?: string;
    relation?: string;
    cpf?: string;
};

type DependentesPayload =
    | Dependente[]
    | {
        dependentes?: Dependente[];
        metadados_plano?: Record<string, any>;
    }
    | null;

type CadastroPlano = {
    id: number;
    plano: PlanoTipo;
    titular_nome: string;
    titular_nascimento: string;
    titular_cpf: string;

    cep: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    complemento?: string | null;

    dependentes: DependentesPayload;
    quantidade_dependentes: number;

    valor_mensalidade: number | string;
    valor_adesao: number | string;
    valor_total: number | string;

    status: StatusPagamento;

    gateway?: string | null;
    gateway_payment_id?: string | null;
    gateway_reference?: string | null;

    ip_cliente?: string | null;
    user_agent?: string | null;

    criado_em: string;
    atualizado_em: string;
};

type ListarResponse = {
    sucesso: boolean;
    pagina: number;
    limite: number;
    total: number;
    total_paginas: number;
    cadastros: CadastroPlano[];
    erro?: string;
    msg?: string;
};

type DetailResponse = {
    sucesso: boolean;
    cadastro: CadastroPlano;
    erro?: string;
    msg?: string;
};

type UpdateStatusResponse = {
    sucesso: boolean;
    id: number;
    status: StatusPagamento;
    msg?: string;
    erro?: string;
};

/* =========================
   Opções
   ========================= */

const STATUS_OPTIONS: Array<{ value: StatusPagamento | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "AGUARDANDO_PAGAMENTO", label: "Aguardando pagamento" },
    { value: "PAGO", label: "Pago" },
    { value: "RECUSADO", label: "Recusado" },
    { value: "CANCELADO", label: "Cancelado" },
    { value: "EXPIRADO", label: "Expirado" },
    { value: "ESTORNADO", label: "Estornado" },
];

const PLANO_OPTIONS: Array<{ value: PlanoTipo | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "FLEX", label: "Flex" },
    { value: "LIGHT", label: "Light" },
    { value: "PLUS", label: "Plus" },
];

/* =========================
   Utils
   ========================= */

function formatCurrency(v: string | number, currency = "BRL") {
    const num = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(num)) return String(v ?? "0");
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
}

function formatDate(value?: string | null) {
    if (!value) return "—";

    try {
        const normalized = value.includes("T") ? value : value.replace(" ", "T");
        const dt = new Date(normalized);

        if (Number.isNaN(dt.getTime())) return value;

        return dt.toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return value;
    }
}

function formatOnlyDate(value?: string | null) {
    if (!value) return "—";

    try {
        const dt = new Date(value + "T00:00:00");

        if (Number.isNaN(dt.getTime())) return value;

        return dt.toLocaleDateString("pt-BR");
    } catch {
        return value;
    }
}

function getAge(dateString?: string | null) {
    if (!dateString) return null;

    const today = new Date();
    const birth = new Date(dateString + "T00:00:00");

    if (Number.isNaN(birth.getTime())) return null;

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }

    return age;
}

function getStatusLabel(status: StatusPagamento) {
    return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

function clsStatusBadge(s: StatusPagamento) {
    switch (s) {
        case "AGUARDANDO_PAGAMENTO":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "PAGO":
            return "bg-emerald-100 text-emerald-900 border-emerald-200";
        case "RECUSADO":
            return "bg-rose-100 text-rose-800 border-rose-200";
        case "CANCELADO":
            return "bg-slate-100 text-slate-800 border-slate-200";
        case "EXPIRADO":
            return "bg-orange-100 text-orange-800 border-orange-200";
        case "ESTORNADO":
            return "bg-purple-100 text-purple-900 border-purple-200";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function clsPlanoBadge(p: PlanoTipo) {
    switch (p) {
        case "FLEX":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "LIGHT":
            return "bg-cyan-100 text-cyan-800 border-cyan-200";
        case "PLUS":
            return "bg-indigo-100 text-indigo-800 border-indigo-200";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function normalizeDependentes(payload: DependentesPayload): Dependente[] {
    if (!payload) return [];

    if (Array.isArray(payload)) {
        return payload;
    }

    if (Array.isArray(payload.dependentes)) {
        return payload.dependentes;
    }

    return [];
}

function getMetadadosPlano(payload: DependentesPayload): Record<string, any> {
    if (!payload || Array.isArray(payload)) return {};
    return payload.metadados_plano || {};
}

function depNome(dep: Dependente) {
    return dep.nome || dep.name || "—";
}

function depNascimento(dep: Dependente) {
    return dep.nascimento || dep.birth || "";
}

function depParentesco(dep: Dependente) {
    return dep.parentesco || dep.relation || "—";
}

function buildAddress(c: CadastroPlano) {
    const linha1 = [c.endereco, c.numero].filter(Boolean).join(", ");
    const linha2 = [c.bairro, `${c.cidade}/${c.estado}`].filter(Boolean).join(" - ");
    const linha3 = [`CEP: ${c.cep}`, c.complemento ? `Complemento: ${c.complemento}` : ""]
        .filter(Boolean)
        .join(" • ");

    return [linha1, linha2, linha3].filter(Boolean).join("\n");
}

function buildWhatsAppText(c: CadastroPlano) {
    const NL = "\r\n";
    const ZWSP = "\u200B";
    const dependentes = normalizeDependentes(c.dependentes);

    const lines = [
        `*Cadastro de Plano:* #${c.id}`,
        `*Origem:* Site Plano PAI`,
        `*Plano:* ${c.plano}`,
        `*Status:* ${getStatusLabel(c.status)}`,
        `*Titular:* ${c.titular_nome}`,
        `*CPF:* ${c.titular_cpf}`,
        `*Nascimento:* ${formatOnlyDate(c.titular_nascimento)}`,
        `*Mensalidade:* ${formatCurrency(c.valor_mensalidade)}`,
        `*Adesão:* ${formatCurrency(c.valor_adesao)}`,
        `*Total inicial:* ${formatCurrency(c.valor_total)}`,
        `*Dependentes:* ${dependentes.length}`,
        `*Endereço:* ${[c.endereco, c.numero, c.bairro, `${c.cidade}/${c.estado}`, c.cep]
            .filter(Boolean)
            .join(" - ")}`,
        `*Criado em:* ${formatDate(c.criado_em)}`,
    ];

    const out: string[] = [];
    lines.forEach((line, index) => {
        out.push(line.trimStart());
        if (index < lines.length - 1) out.push(ZWSP);
    });

    return out.join(NL);
}

async function shareOrOpenWhatsApp(text: string) {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
            await (navigator as any).share({ text });
            return;
        } catch {
            /* continua para fallback */
        }
    }

    const encoded = encodeURIComponent(text);
    const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(
        (typeof navigator !== "undefined" && navigator.userAgent) || ""
    );

    const deep = isMobile ? `whatsapp://send?text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`;
    const opened = window.open(deep, "_blank", "noopener,noreferrer");

    if (opened) return;

    try {
        await navigator.clipboard.writeText(text);
    } catch {
        /* sem ação */
    }

    window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
}

/* =========================
   Página
   ========================= */

export const dynamic = "force-dynamic";

export default function Page() {
    const [q, setQ] = React.useState("");
    const [status, setStatus] = React.useState<StatusPagamento | "all">("all");
    const [plano, setPlano] = React.useState<PlanoTipo | "all">("all");

    const [page, setPage] = React.useState(1);
    const [perPage, setPerPage] = React.useState(20);

    const [cadastros, setCadastros] = React.useState<CadastroPlano[]>([]);
    const [meta, setMeta] = React.useState({
        page: 1,
        perPage: 20,
        total: 0,
        totalPages: 0,
    });

    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const [open, setOpen] = React.useState(false);
    const [detail, setDetail] = React.useState<CadastroPlano | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);

    const [copied, setCopied] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);

    async function fetchCadastros() {
        setLoading(true);
        setError(null);

        try {
            const u = new URL(CADASTROS_PLANOS_API_URL);
            u.searchParams.set("listar", "1");
            u.searchParams.set("pagina", String(page));
            u.searchParams.set("limite", String(perPage));

            if (q.trim()) u.searchParams.set("busca", q.trim());
            if (status !== "all") u.searchParams.set("status", status);
            if (plano !== "all") u.searchParams.set("plano", plano);

            const res = await fetch(u.toString(), { cache: "no-store" });
            const text = await res.text();

            let json: ListarResponse;
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(text || `Falha ao buscar cadastros (${res.status})`);
            }

            if (!res.ok || !json.sucesso) {
                throw new Error(json.erro || json.msg || `Falha ao buscar cadastros (${res.status})`);
            }

            setCadastros(json.cadastros || []);
            setMeta({
                page: json.pagina || page,
                perPage: json.limite || perPage,
                total: json.total || 0,
                totalPages: json.total_paginas || 0,
            });
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar vendas dos planos");
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        fetchCadastros();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, perPage]);

    function onSubmitFilters(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);

        setTimeout(() => {
            fetchCadastros();
        }, 0);
    }

    async function openDetail(id: number) {
        setDetail(null);
        setCopied(false);
        setOpen(true);
        setDetailLoading(true);

        try {
            const u = new URL(CADASTROS_PLANOS_API_URL);
            u.searchParams.set("id", String(id));

            const res = await fetch(u.toString(), { cache: "no-store" });
            const text = await res.text();

            let json: DetailResponse;
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(text || `Falha ao carregar cadastro #${id}`);
            }

            if (!res.ok || !json.sucesso) {
                throw new Error(json.erro || json.msg || `Falha ao carregar cadastro #${id}`);
            }

            setDetail(json.cadastro);
        } catch (e: any) {
            alert(e?.message || "Não foi possível carregar os detalhes.");
            setOpen(false);
        } finally {
            setDetailLoading(false);
        }
    }

    async function updateStatus(id: number, newStatus: StatusPagamento) {
        setUpdating(true);

        try {
            const res = await fetch(CADASTROS_PLANOS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "atualizar_status",
                    id,
                    status: newStatus,
                }),
            });

            const text = await res.text();

            let json: UpdateStatusResponse;
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(text || "Falha ao atualizar status.");
            }

            if (!res.ok || !json.sucesso) {
                throw new Error(json.erro || json.msg || "Falha ao atualizar status.");
            }

            await fetchCadastros();

            if (detail?.id === id) {
                await openDetail(id);
            }
        } catch (e: any) {
            alert(e?.message || "Não foi possível atualizar o status.");
        } finally {
            setUpdating(false);
        }
    }

    async function copyCadastroToClipboard(c: CadastroPlano) {
        try {
            await navigator.clipboard.writeText(buildWhatsAppText(c));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            alert("Não foi possível copiar o texto.");
        }
    }

    async function notifyWhatsApp(cadastro: CadastroPlano) {
        try {
            await shareOrOpenWhatsApp(buildWhatsAppText(cadastro));
        } catch (e: any) {
            alert(e?.message || "Não foi possível abrir o WhatsApp.");
        }
    }

    function clearFilters() {
        setQ("");
        setStatus("all");
        setPlano("all");
        setPage(1);

        setTimeout(() => {
            fetchCadastros();
        }, 0);
    }

    return (
        <div className="flex h-full flex-col">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
                <div>
                    <h1 className="text-xl font-semibold">Vendas — Planos</h1>
                    <p className="text-sm text-muted-foreground">
                        Cadastros recebidos dos planos Flex, Light e Plus.
                    </p>
                </div>

                <button
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    onClick={() => fetchCadastros()}
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
                            placeholder="Nome, CPF ou cidade..."
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium">Plano</label>
                    <select
                        className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                        value={plano}
                        onChange={(e) => setPlano(e.target.value as PlanoTipo | "all")}
                    >
                        {PLANO_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium">Status</label>
                    <select
                        className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as StatusPagamento | "all")}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium">Por página</label>
                    <select
                        className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                        value={perPage}
                        onChange={(e) => {
                            setPerPage(Number(e.target.value));
                            setPage(1);
                        }}
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-2">
                    <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
                        disabled={loading}
                    >
                        <IconSearch className="size-4" />
                        Buscar
                    </button>

                    <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm"
                        onClick={clearFilters}
                        disabled={loading}
                    >
                        Limpar
                    </button>
                </div>
            </form>

            {/* Lista MOBILE */}
            <div className="px-4 pb-6 lg:px-6 md:hidden">
                <div className="space-y-3">
                    {cadastros.map((c) => {
                        const dependentes = normalizeDependentes(c.dependentes);

                        return (
                            <div key={c.id} className="rounded-lg border bg-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-muted-foreground">
                                        Nº <b>{c.id}</b> • {formatDate(c.criado_em)}
                                    </div>

                                    <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${clsPlanoBadge(
                                            c.plano
                                        )}`}
                                    >
                                        {c.plano}
                                    </span>
                                </div>

                                <div className="mt-2">
                                    <div className="font-medium leading-tight">{c.titular_nome}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        CPF: {c.titular_cpf}
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {formatCurrency(c.valor_total)} • {dependentes.length} dependente(s)
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(
                                            c.status
                                        )}`}
                                    >
                                        {getStatusLabel(c.status)}
                                    </span>
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={() => openDetail(c.id)}
                                    >
                                        <IconEye className="size-4" />
                                        Ver
                                    </button>

                                    <button
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={() => notifyWhatsApp(c)}
                                    >
                                        <IconSend className="size-4" />
                                        WhatsApp
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {!loading && cadastros.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground">
                            Nenhum cadastro encontrado.
                        </div>
                    )}

                    {loading && (
                        <div className="text-center text-sm text-muted-foreground">
                            Carregando cadastros…
                        </div>
                    )}

                    {error && <div className="text-sm text-rose-600">{error}</div>}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                        Página {meta.page} de {meta.totalPages || 1}
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
                            onClick={() =>
                                setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))
                            }
                            disabled={meta.totalPages ? page >= meta.totalPages || loading : loading}
                        >
                            Próxima
                            <IconChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabela DESKTOP */}
            <div className="hidden flex-1 overflow-auto px-4 pb-6 lg:px-6 md:block">
                <div className="overflow-hidden rounded-lg border bg-card">
                    <div className="relative overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-muted/50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Nº</th>
                                    <th className="px-3 py-2 font-medium">Data</th>
                                    <th className="px-3 py-2 font-medium">Titular</th>
                                    <th className="px-3 py-2 font-medium">Plano</th>
                                    <th className="px-3 py-2 font-medium">Mensalidade</th>
                                    <th className="px-3 py-2 font-medium">Total inicial</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium text-right">Ações</th>
                                </tr>
                            </thead>

                            <tbody>
                                {cadastros.length === 0 && !loading && (
                                    <tr>
                                        <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                                            Nenhum cadastro encontrado.
                                        </td>
                                    </tr>
                                )}

                                {cadastros.map((c) => (
                                    <tr key={c.id} className="border-t">
                                        <td className="px-3 py-2">{c.id}</td>
                                        <td className="px-3 py-2">{formatDate(c.criado_em)}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium">{c.titular_nome}</div>
                                            <div className="text-xs text-muted-foreground">{c.titular_cpf}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsPlanoBadge(
                                                    c.plano
                                                )}`}
                                            >
                                                {c.plano}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">{formatCurrency(c.valor_mensalidade)}</td>
                                        <td className="px-3 py-2">{formatCurrency(c.valor_total)}</td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(
                                                    c.status
                                                )}`}
                                            >
                                                {getStatusLabel(c.status)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                    onClick={() => openDetail(c.id)}
                                                    title="Ver detalhes"
                                                >
                                                    <IconEye className="size-4" />
                                                    Ver
                                                </button>

                                                <button
                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                    onClick={() => notifyWhatsApp(c)}
                                                    title="Compartilhar via WhatsApp"
                                                >
                                                    <IconSend className="size-4" />
                                                    WhatsApp
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {loading && (
                            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                                Carregando cadastros…
                            </div>
                        )}

                        {error && <div className="px-3 pb-3 text-sm text-rose-600">{error}</div>}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                            Página {meta.page} de {meta.totalPages || 1} — {meta.total} cadastro(s)
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
                                onClick={() =>
                                    setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))
                                }
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
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setOpen(false)}
                        aria-hidden
                    />

                    <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-white shadow-xl md:max-w-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Cadastro de plano</div>
                                <div className="text-lg font-semibold">#{detail?.id || "—"}</div>
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
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span
                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsPlanoBadge(
                                                detail.plano
                                            )}`}
                                        >
                                            {detail.plano}
                                        </span>

                                        <span
                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${clsStatusBadge(
                                                detail.status
                                            )}`}
                                        >
                                            {getStatusLabel(detail.status)}
                                        </span>
                                    </div>

                                    <div className="text-sm text-muted-foreground">
                                        Criado em {formatDate(detail.criado_em)}
                                    </div>
                                </div>

                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <h2 className="mb-2 font-semibold">Titular</h2>

                                    <div>
                                        <b>Nome:</b> {detail.titular_nome}
                                    </div>
                                    <div>
                                        <b>CPF:</b> {detail.titular_cpf}
                                    </div>
                                    <div>
                                        <b>Nascimento:</b> {formatOnlyDate(detail.titular_nascimento)}
                                    </div>
                                    <div>
                                        <b>Idade:</b> {getAge(detail.titular_nascimento) ?? "—"} anos
                                    </div>
                                </div>

                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <h2 className="mb-2 font-semibold">Valores</h2>

                                    <div>
                                        <b>Mensalidade:</b> {formatCurrency(detail.valor_mensalidade)}
                                    </div>
                                    <div>
                                        <b>Adesão:</b> {formatCurrency(detail.valor_adesao)}
                                    </div>
                                    <div>
                                        <b>Total inicial:</b> {formatCurrency(detail.valor_total)}
                                    </div>
                                </div>

                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <h2 className="mb-2 font-semibold">Endereço</h2>
                                    <div className="whitespace-pre-line">{buildAddress(detail)}</div>
                                </div>

                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <h2 className="mb-2 font-semibold">Dependentes</h2>

                                    {normalizeDependentes(detail.dependentes).length === 0 ? (
                                        <div className="text-muted-foreground">Nenhum dependente informado.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {normalizeDependentes(detail.dependentes).map((dep, index) => (
                                                <div key={index} className="rounded-md border p-2">
                                                    <div>
                                                        <b>{index + 1}. {depNome(dep)}</b>
                                                    </div>
                                                    <div>
                                                        Nascimento: {formatOnlyDate(depNascimento(dep))}
                                                        {getAge(depNascimento(dep)) !== null
                                                            ? ` — ${getAge(depNascimento(dep))} anos`
                                                            : ""}
                                                    </div>
                                                    <div>Parentesco: {depParentesco(dep)}</div>
                                                    {dep.cpf && <div>CPF: {dep.cpf}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {Object.keys(getMetadadosPlano(detail.dependentes)).length > 0 && (
                                    <div className="rounded-lg border p-3 text-sm leading-6">
                                        <h2 className="mb-2 font-semibold">Detalhes do cálculo</h2>

                                        <div className="space-y-1">
                                            {Object.entries(getMetadadosPlano(detail.dependentes)).map(([key, value]) => (
                                                <div key={key}>
                                                    <b>{key}:</b> {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-lg border p-3">
                                    <div className="mb-3 text-sm font-semibold">Atualizar status</div>

                                    <div className="flex flex-wrap gap-2">
                                        {(
                                            [
                                                "AGUARDANDO_PAGAMENTO",
                                                "PAGO",
                                                "RECUSADO",
                                                "CANCELADO",
                                                "EXPIRADO",
                                                "ESTORNADO",
                                            ] as StatusPagamento[]
                                        ).map((s) => (
                                            <button
                                                key={s}
                                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                                onClick={() => updateStatus(detail.id, s)}
                                                disabled={updating || detail.status === s}
                                            >
                                                <IconCheck className="size-4" />
                                                {getStatusLabel(s)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={() => copyCadastroToClipboard(detail)}
                                    >
                                        <IconCopy className="size-4" />
                                        {copied ? "Copiado!" : "Copiar cadastro"}
                                    </button>

                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={() => notifyWhatsApp(detail)}
                                    >
                                        <IconSend className="size-4" />
                                        WhatsApp
                                    </button>
                                </div>

                                {(detail.gateway || detail.gateway_payment_id || detail.gateway_reference) && (
                                    <div className="rounded-lg border p-3 text-sm leading-6">
                                        <h2 className="mb-2 font-semibold">Gateway</h2>

                                        {detail.gateway && (
                                            <div>
                                                <b>Gateway:</b> {detail.gateway}
                                            </div>
                                        )}

                                        {detail.gateway_payment_id && (
                                            <div>
                                                <b>Payment ID:</b> {detail.gateway_payment_id}
                                            </div>
                                        )}

                                        {detail.gateway_reference && (
                                            <div>
                                                <b>Referência:</b> {detail.gateway_reference}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
