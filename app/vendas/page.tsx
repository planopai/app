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
    titular_celular?: string | null;

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

    const birth = new Date(dateString + "T00:00:00");

    if (Number.isNaN(birth.getTime())) return null;

    const today = new Date();

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

function buildFullCadastroText(c: CadastroPlano) {
    const dependentes = normalizeDependentes(c.dependentes);
    const metadados = getMetadadosPlano(c.dependentes);

    const lines = [
        `Cadastro de Plano #${c.id}`,
        `Plano: ${c.plano}`,
        `Status: ${getStatusLabel(c.status)}`,
        `Titular: ${c.titular_nome}`,
        `CPF: ${c.titular_cpf}`,
        `Celular: ${c.titular_celular || "—"}`,
        `Nascimento: ${formatOnlyDate(c.titular_nascimento)}`,
        `Idade: ${getAge(c.titular_nascimento) ?? "—"} anos`,
        `Mensalidade: ${formatCurrency(c.valor_mensalidade)}`,
        `Adesão: ${formatCurrency(c.valor_adesao)}`,
        `Total inicial: ${formatCurrency(c.valor_total)}`,
        `Endereço: ${[c.endereco, c.numero, c.bairro, `${c.cidade}/${c.estado}`, c.cep]
            .filter(Boolean)
            .join(" - ")}`,
        c.complemento ? `Complemento: ${c.complemento}` : "",
        `Dependentes: ${dependentes.length}`,
        ...dependentes.map((dep, index) => {
            const idade = getAge(depNascimento(dep));
            return `${index + 1}. ${depNome(dep)} | ${formatOnlyDate(depNascimento(dep))}${idade !== null ? ` | ${idade} anos` : ""
                } | ${depParentesco(dep)}${dep.cpf ? ` | CPF: ${dep.cpf}` : ""}`;
        }),
        Object.keys(metadados).length ? `Metadados: ${JSON.stringify(metadados)}` : "",
        `Criado em: ${formatDate(c.criado_em)}`,
        `Atualizado em: ${formatDate(c.atualizado_em)}`,
    ];

    return lines.filter(Boolean).join("\n");
}

/* =========================
   Componentes pequenos
   ========================= */

function CopyButton({
    value,
    label = "Copiar",
    className = "",
}: {
    value?: string | number | null;
    label?: string;
    className?: string;
}) {
    const [copied, setCopied] = React.useState(false);

    async function copy() {
        const text = String(value ?? "").trim();

        if (!text || text === "—") return;

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            alert("Não foi possível copiar.");
        }
    }

    return (
        <button
            type="button"
            onClick={copy}
            disabled={!String(value ?? "").trim() || String(value ?? "").trim() === "—"}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
            title={copied ? "Copiado!" : label}
        >
            <IconCopy className="size-3.5" />
            {copied ? "Copiado" : label}
        </button>
    );
}

function DetailField({
    label,
    value,
    copyValue,
    multiline = false,
}: {
    label: string;
    value?: React.ReactNode;
    copyValue?: string | number | null;
    multiline?: boolean;
}) {
    const resolvedCopy =
        copyValue ??
        (typeof value === "string" || typeof value === "number" ? value : "");

    return (
        <div className="rounded-lg border bg-background p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
            <div className="flex items-start justify-between gap-3">
                <div className={`min-w-0 text-sm font-medium ${multiline ? "whitespace-pre-line" : "break-words"}`}>
                    {value || "—"}
                </div>
                <CopyButton value={resolvedCopy} />
            </div>
        </div>
    );
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

    React.useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }

        if (open) {
            document.addEventListener("keydown", onKeyDown);
            document.body.style.overflow = "hidden";
        }

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = "";
        };
    }, [open]);

    function onSubmitFilters(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);

        setTimeout(() => {
            fetchCadastros();
        }, 0);
    }

    async function openDetail(id: number) {
        setDetail(null);
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

    function clearFilters() {
        setQ("");
        setStatus("all");
        setPlano("all");
        setPage(1);

        setTimeout(() => {
            fetchCadastros();
        }, 0);
    }

    const modalDependentes = detail ? normalizeDependentes(detail.dependentes) : [];
    const modalMetadados = detail ? getMetadadosPlano(detail.dependentes) : {};

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
                            placeholder="Nome, CPF, celular ou cidade..."
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
                                        Celular: {c.titular_celular || "—"}
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
                                            <div className="text-xs text-muted-foreground">{c.titular_celular || "—"}</div>
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

            {/* Modal central */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setOpen(false)}
                        aria-hidden
                    />

                    <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">Cadastro de plano</div>
                                <div className="truncate text-lg font-semibold">
                                    {detail ? `#${detail.id} — ${detail.titular_nome}` : "Carregando..."}
                                </div>

                                {detail && (
                                    <div className="mt-2 flex flex-wrap gap-2">
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
                                )}
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
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                Carregando…
                            </div>
                        ) : (
                            <>
                                <div className="overflow-auto p-4 sm:p-5">
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                        {/* Dados principais */}
                                        <section className="rounded-xl border bg-card p-3 sm:p-4">
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <h2 className="font-semibold">Dados do titular</h2>
                                                <CopyButton
                                                    value={`${detail.titular_nome} | ${detail.titular_cpf} | ${detail.titular_celular || "—"}`}
                                                    label="Copiar titular"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <DetailField label="Nome" value={detail.titular_nome} />
                                                <DetailField label="CPF" value={detail.titular_cpf} />
                                                <DetailField
                                                    label="Celular"
                                                    value={detail.titular_celular || "—"}
                                                    copyValue={detail.titular_celular || ""}
                                                />
                                                <DetailField
                                                    label="Nascimento"
                                                    value={formatOnlyDate(detail.titular_nascimento)}
                                                    copyValue={detail.titular_nascimento}
                                                />
                                                <DetailField
                                                    label="Idade"
                                                    value={`${getAge(detail.titular_nascimento) ?? "—"} anos`}
                                                />
                                            </div>
                                        </section>

                                        {/* Plano e valores */}
                                        <section className="rounded-xl border bg-card p-3 sm:p-4">
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <h2 className="font-semibold">Plano e valores</h2>
                                                <CopyButton
                                                    value={`Plano: ${detail.plano} | Mensalidade: ${formatCurrency(
                                                        detail.valor_mensalidade
                                                    )} | Adesão: ${formatCurrency(detail.valor_adesao)} | Total inicial: ${formatCurrency(
                                                        detail.valor_total
                                                    )}`}
                                                    label="Copiar valores"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <DetailField label="Plano" value={detail.plano} />
                                                <DetailField
                                                    label="Status"
                                                    value={getStatusLabel(detail.status)}
                                                    copyValue={detail.status}
                                                />
                                                <DetailField
                                                    label="Mensalidade"
                                                    value={formatCurrency(detail.valor_mensalidade)}
                                                />
                                                <DetailField
                                                    label="Adesão"
                                                    value={formatCurrency(detail.valor_adesao)}
                                                />
                                                <DetailField
                                                    label="Total inicial"
                                                    value={formatCurrency(detail.valor_total)}
                                                />
                                                <DetailField
                                                    label="Dependentes"
                                                    value={`${modalDependentes.length} dependente(s)`}
                                                    copyValue={modalDependentes.length}
                                                />
                                            </div>
                                        </section>

                                        {/* Endereço */}
                                        <section className="rounded-xl border bg-card p-3 sm:p-4 lg:col-span-2">
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <h2 className="font-semibold">Endereço</h2>
                                                <CopyButton value={buildAddress(detail)} label="Copiar endereço" />
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <DetailField label="CEP" value={detail.cep} />
                                                <DetailField label="Endereço" value={detail.endereco} />
                                                <DetailField label="Número" value={detail.numero} />
                                                <DetailField label="Bairro" value={detail.bairro} />
                                                <DetailField label="Cidade" value={detail.cidade} />
                                                <DetailField label="Estado" value={detail.estado} />
                                                <div className="sm:col-span-2 lg:col-span-3">
                                                    <DetailField
                                                        label="Complemento"
                                                        value={detail.complemento || "—"}
                                                        copyValue={detail.complemento || ""}
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        {/* Dependentes */}
                                        <section className="rounded-xl border bg-card p-3 sm:p-4 lg:col-span-2">
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <h2 className="font-semibold">Dependentes</h2>
                                                <CopyButton
                                                    value={
                                                        modalDependentes.length
                                                            ? modalDependentes
                                                                .map((dep, index) => {
                                                                    const nascimento = depNascimento(dep);
                                                                    const idade = getAge(nascimento);
                                                                    return `${index + 1}. ${depNome(dep)} | ${formatOnlyDate(
                                                                        nascimento
                                                                    )}${idade !== null ? ` | ${idade} anos` : ""} | ${depParentesco(dep)}${dep.cpf ? ` | CPF: ${dep.cpf}` : ""
                                                                        }`;
                                                                })
                                                                .join("\n")
                                                            : "Nenhum dependente informado"
                                                    }
                                                    label="Copiar todos"
                                                />
                                            </div>

                                            {modalDependentes.length === 0 ? (
                                                <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                                                    Nenhum dependente informado.
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                                    {modalDependentes.map((dep, index) => {
                                                        const nascimento = depNascimento(dep);
                                                        const idade = getAge(nascimento);
                                                        const resumoDep = `${depNome(dep)} | ${formatOnlyDate(nascimento)}${idade !== null ? ` | ${idade} anos` : ""
                                                            } | ${depParentesco(dep)}${dep.cpf ? ` | CPF: ${dep.cpf}` : ""}`;

                                                        return (
                                                            <div key={index} className="rounded-lg border bg-background p-3">
                                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                                    <div className="font-medium">
                                                                        Dependente {index + 1}
                                                                    </div>
                                                                    <CopyButton value={resumoDep} label="Copiar" />
                                                                </div>

                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <DetailField label="Nome" value={depNome(dep)} />
                                                                    <DetailField
                                                                        label="Parentesco"
                                                                        value={depParentesco(dep)}
                                                                    />
                                                                    <DetailField
                                                                        label="Nascimento"
                                                                        value={formatOnlyDate(nascimento)}
                                                                        copyValue={nascimento}
                                                                    />
                                                                    <DetailField
                                                                        label="Idade"
                                                                        value={idade !== null ? `${idade} anos` : "—"}
                                                                    />
                                                                    {dep.cpf && <DetailField label="CPF" value={dep.cpf} />}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        {/* Cálculo / metadados */}
                                        {Object.keys(modalMetadados).length > 0 && (
                                            <section className="rounded-xl border bg-card p-3 sm:p-4 lg:col-span-2">
                                                <div className="mb-3 flex items-center justify-between gap-2">
                                                    <h2 className="font-semibold">Detalhes do cálculo</h2>
                                                    <CopyButton
                                                        value={JSON.stringify(modalMetadados, null, 2)}
                                                        label="Copiar cálculo"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    {Object.entries(modalMetadados).map(([key, value]) => (
                                                        <DetailField
                                                            key={key}
                                                            label={key}
                                                            value={
                                                                typeof value === "object"
                                                                    ? JSON.stringify(value)
                                                                    : String(value)
                                                            }
                                                            copyValue={
                                                                typeof value === "object"
                                                                    ? JSON.stringify(value)
                                                                    : String(value)
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Gateway */}
                                        {(detail.gateway || detail.gateway_payment_id || detail.gateway_reference) && (
                                            <section className="rounded-xl border bg-card p-3 sm:p-4 lg:col-span-2">
                                                <h2 className="mb-3 font-semibold">Gateway</h2>

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                    <DetailField
                                                        label="Gateway"
                                                        value={detail.gateway || "—"}
                                                        copyValue={detail.gateway || ""}
                                                    />
                                                    <DetailField
                                                        label="Payment ID"
                                                        value={detail.gateway_payment_id || "—"}
                                                        copyValue={detail.gateway_payment_id || ""}
                                                    />
                                                    <DetailField
                                                        label="Referência"
                                                        value={detail.gateway_reference || "—"}
                                                        copyValue={detail.gateway_reference || ""}
                                                    />
                                                </div>
                                            </section>
                                        )}

                                        {/* Datas */}
                                        <section className="rounded-xl border bg-card p-3 sm:p-4 lg:col-span-2">
                                            <h2 className="mb-3 font-semibold">Controle</h2>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <DetailField
                                                    label="Criado em"
                                                    value={formatDate(detail.criado_em)}
                                                    copyValue={detail.criado_em}
                                                />
                                                <DetailField
                                                    label="Atualizado em"
                                                    value={formatDate(detail.atualizado_em)}
                                                    copyValue={detail.atualizado_em}
                                                />
                                            </div>
                                        </section>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 border-t bg-white px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                                            Atualizar status
                                        </div>

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
                                        <CopyButton
                                            value={buildFullCadastroText(detail)}
                                            label="Copiar cadastro completo"
                                            className="px-3 py-2 text-sm"
                                        />

                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                            onClick={() => setOpen(false)}
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
