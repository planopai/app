"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconSearch,
    IconRefresh,
    IconChevronLeft,
    IconChevronRight,
    IconUserCircle,
    IconId,
    IconFileText,
    IconCash,
    IconLock,
    IconMail,
    IconPhone,
    IconShieldLock,
    IconX,
    IconCheck,
    IconAlertTriangle,
    IconCopy,
    IconInfoCircle,
} from "@tabler/icons-react";

/* =========================
   CONFIG
========================= */
const ENDPOINT =
    "https://api.planoassistencialintegrado.com.br/associados_geral.php";

/* =========================
   UI styles (padrão + melhor alinhamento)
========================= */
const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

const btnOutline =
    btnBase + " border border-primary text-primary hover:bg-primary/5 active:bg-primary/10";

const btnNeutral =
    btnBase + " border border-muted text-foreground hover:bg-muted/40 active:bg-muted/50";

const btnDanger =
    btnBase + " border border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-900/20";

const badge =
    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold";

const inputCls =
    "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none " +
    "focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition";

/* =========================
   Types
========================= */
type Contract = {
    id: number;
    contrato_numero?: string;
    contrato?: string;
    situacao?: string;
    idSituacao?: number;
    cpf_cnpj?: string;
    nome?: string;
    plano?: string;
    cobertura?: string;
    cidade?: string;
    celularTitular?: string;
    foneTitular?: string;
    dataultimopagamento?: string;
    datapagamento?: number;
};

type LocalAuth = {
    cpf: string;
    email: string;
    telefone: string;
    email_verificado: number;
    telefone_verificado: number;
    tentativas: number;
    bloqueado_ate: string | null;
    ultimo_login: string | null;
} | null;

type BeneficiarioResponse = any;

type ContasReceberItem = {
    id: number;
    situacao: "P" | "B" | "C" | string;
    parcela?: string;
    valor?: number;
    dataVencimento?: string;
    dataEmissao?: string;
    tipo?: string;
    cobranca?: string;
    linhaDigitavel?: string;
    nossoNumero?: string;
};

type ContractDetail = {
    ok: boolean;
    local_auth: LocalAuth;
    beneficiario: BeneficiarioResponse | null;
    contas_receber: any | null;
};

function onlyDigits(v: string) {
    return (v || "").replace(/\D+/g, "");
}

function fmtMoneyBR(v: any) {
    const n = Number(v);
    if (!isFinite(n)) return "-";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: any) {
    if (!v) return "-";
    const s = String(v);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    return s;
}

function statusBadgeSituacao(situacao?: string) {
    const s = (situacao || "").toUpperCase();
    if (s.includes("ATIVO"))
        return (
            badge + " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
        );
    if (s.includes("INADIMPL"))
        return (
            badge + " border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        );
    if (s.includes("BLOQUE"))
        return (
            badge + " border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
        );
    if (s.includes("CANCEL"))
        return (
            badge + " border-zinc-300 bg-zinc-50 text-zinc-800 dark:bg-zinc-900/20 dark:text-zinc-200"
        );
    return badge + " border-muted bg-muted/30 text-foreground";
}

async function safeJson(res: Response) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

function normalizeContractsPayload(data: any): Contract[] {
    const raw = data?.data;
    if (Array.isArray(raw)) return raw as Contract[];
    if (raw && Array.isArray(raw.data)) return raw.data as Contract[];
    if (raw && Array.isArray(raw.items)) return raw.items as Contract[];
    if (Array.isArray(data)) return data as Contract[];
    return [];
}

function normalizeContasPayload(raw: any): ContasReceberItem[] {
    if (Array.isArray(raw)) return raw as any;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
}

function toastMessage(kind: "ok" | "warn" | "err", msg: string) {
    // simples (sem libs): usa alert no fallback
    // você pode trocar por sonner/toast no futuro.
    if (kind === "ok") alert(msg);
    else if (kind === "warn") alert(msg);
    else alert(msg);
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toastMessage("ok", "Copiado para a área de transferência.");
    } catch {
        toastMessage("err", "Não foi possível copiar.");
    }
}

/* =========================
   Card de Contrato
========================= */
function ContractCard({
    item,
    onOpen,
}: {
    item: Contract;
    onOpen: (c: Contract) => void;
}) {
    return (
        <button
            onClick={() => onOpen(item)}
            className="text-left w-full rounded-2xl border bg-card/70 p-4 shadow-sm hover:bg-card/90 hover:shadow-md transition"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 grid size-12 place-items-center rounded-xl border bg-background/40">
                    <IconUserCircle className="size-6 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold">
                            {item.nome || "(Sem nome)"}
                        </div>
                        <span className={statusBadgeSituacao(item.situacao)}>
                            <IconShieldLock className="size-3" />
                            {item.situacao || "—"}
                        </span>
                    </div>

                    <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                                <IconId className="size-4" />
                                <span className="font-medium text-foreground">CPF:</span>{" "}
                                {item.cpf_cnpj || "-"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <IconFileText className="size-4" />
                                <span className="font-medium text-foreground">Contrato:</span>{" "}
                                {item.contrato_numero || item.contrato || "-"}
                            </span>
                        </div>

                        <div className="truncate">
                            <span className="font-medium text-foreground">Plano:</span>{" "}
                            {item.plano || "-"} {item.cobertura ? `• ${item.cobertura}` : ""}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                                <span className="font-medium text-foreground">Cidade:</span>{" "}
                                {item.cidade || "-"}
                            </span>
                            <span>
                                <span className="font-medium text-foreground">Últ. Pagto:</span>{" "}
                                {item.dataultimopagamento ? fmtDate(item.dataultimopagamento) : "-"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </button>
    );
}

/* =========================
   Pager
========================= */
function Pager({
    page,
    onPrev,
    onNext,
    disabledPrev,
    disabledNext,
}: {
    page: number;
    onPrev: () => void;
    onNext: () => void;
    disabledPrev: boolean;
    disabledNext: boolean;
}) {
    return (
        <div className="mt-6 flex items-center justify-center gap-3">
            <button
                onClick={onPrev}
                disabled={disabledPrev}
                className={btnNeutral + " min-w-[120px]"}
            >
                <IconChevronLeft className="size-4" />
                Anterior
            </button>

            <span className="text-sm text-muted-foreground">
                Página <span className="font-semibold text-foreground">{page}</span>
            </span>

            <button
                onClick={onNext}
                disabled={disabledNext}
                className={btnNeutral + " min-w-[120px]"}
            >
                Próximo
                <IconChevronRight className="size-4" />
            </button>
        </div>
    );
}

/* =========================
   Drawer de detalhes
========================= */
function DetailDrawer({
    open,
    onClose,
    contract,
    detail,
    loading,
    onReload,
    onUpsertAccess,
    onResetAccess,
}: {
    open: boolean;
    onClose: () => void;
    contract: Contract | null;
    detail: ContractDetail | null;
    loading: boolean;
    onReload: () => void;
    onUpsertAccess: (payload: {
        cpf: string;
        senha: string;
        email: string;
        telefone: string;
    }) => Promise<void>;
    onResetAccess: (cpf: string) => Promise<void>;
}) {
    const [senha, setSenha] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");

    useEffect(() => {
        if (detail?.local_auth) {
            setEmail(detail.local_auth.email || "");
            setTelefone(detail.local_auth.telefone || "");
        } else {
            setEmail("");
            setTelefone("");
        }
        setSenha("");
    }, [detail, open]);

    useEffect(() => {
        function onEsc(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        if (open) window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    if (!open) return null;

    const cpfDigits = onlyDigits(contract?.cpf_cnpj || "");
    const contas = useMemo(
        () => normalizeContasPayload(detail?.contas_receber),
        [detail]
    );

    const local = detail?.local_auth;
    const hasAccess = !!local;

    return (
        <div className="fixed inset-0 z-50">
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-background shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                        <div className="truncate text-lg font-bold">
                            {contract?.nome || "Detalhes do Associado"}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <IconId className="size-4" />
                                {contract?.cpf_cnpj || "-"}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="inline-flex items-center gap-1">
                                <IconFileText className="size-4" />
                                {contract?.contrato_numero || contract?.contrato || "-"}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className={statusBadgeSituacao(contract?.situacao)}>
                                {contract?.situacao || "—"}
                            </span>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button onClick={onReload} className={btnNeutral} title="Recarregar">
                            <IconRefresh className="size-4" />
                            Atualizar
                        </button>
                        <button onClick={onClose} className={btnNeutral} title="Fechar">
                            <IconX className="size-4" />
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="h-[calc(100%-64px)] overflow-y-auto p-4">
                    {loading && (
                        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                            Carregando detalhes…
                        </div>
                    )}

                    {/* Acesso App */}
                    <div className="rounded-2xl border bg-card/60 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-base font-semibold">
                                    <IconLock className="size-5 text-muted-foreground" />
                                    Acesso do App (associados_auth)
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    Crie/atualize credenciais e faça reset de senha.
                                </div>
                            </div>

                            <span
                                className={
                                    badge +
                                    " " +
                                    (hasAccess
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                                        : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200")
                                }
                            >
                                {hasAccess ? (
                                    <>
                                        <IconCheck className="size-3" /> Acesso existe
                                    </>
                                ) : (
                                    <>
                                        <IconAlertTriangle className="size-3" /> Sem acesso
                                    </>
                                )}
                            </span>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-xl border bg-background p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">Status</div>
                                    <button
                                        className={btnNeutral + " py-1 px-2 text-xs"}
                                        onClick={() => cpfDigits && copyToClipboard(cpfDigits)}
                                        disabled={!cpfDigits}
                                        title="Copiar CPF (somente números)"
                                    >
                                        <IconCopy className="size-4" />
                                        Copiar CPF
                                    </button>
                                </div>

                                <div className="mt-2 text-sm text-muted-foreground grid gap-1">
                                    <div>
                                        <span className="text-foreground font-medium">CPF:</span>{" "}
                                        {cpfDigits || "-"}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <IconMail className="size-4" />
                                        <span className="text-foreground font-medium">Email:</span>{" "}
                                        {local?.email || "-"}
                                        {local?.email_verificado ? (
                                            <span
                                                className={
                                                    badge +
                                                    " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                                                }
                                            >
                                                verificado
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <IconPhone className="size-4" />
                                        <span className="text-foreground font-medium">Telefone:</span>{" "}
                                        {local?.telefone || "-"}
                                        {local?.telefone_verificado ? (
                                            <span
                                                className={
                                                    badge +
                                                    " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                                                }
                                            >
                                                verificado
                                            </span>
                                        ) : null}
                                    </div>

                                    <div>
                                        <span className="text-foreground font-medium">Último login:</span>{" "}
                                        {local?.ultimo_login ? fmtDate(local.ultimo_login) : "-"}
                                    </div>
                                    <div>
                                        <span className="text-foreground font-medium">Bloqueado até:</span>{" "}
                                        {local?.bloqueado_ate ? fmtDate(local.bloqueado_ate) : "-"}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-background p-3">
                                <div className="text-sm font-semibold mb-2">Criar / Atualizar Acesso</div>

                                <div className="grid gap-2">
                                    <div className="grid gap-1">
                                        <label className="text-xs text-muted-foreground">E-mail</label>
                                        <input
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className={inputCls}
                                            placeholder="email@dominio.com"
                                            inputMode="email"
                                        />
                                    </div>

                                    <div className="grid gap-1">
                                        <label className="text-xs text-muted-foreground">
                                            Telefone (DDD + número)
                                        </label>
                                        <input
                                            value={telefone}
                                            onChange={(e) => setTelefone(e.target.value)}
                                            className={inputCls}
                                            placeholder="(11) 99999-9999"
                                            inputMode="tel"
                                        />
                                    </div>

                                    <div className="grid gap-1">
                                        <label className="text-xs text-muted-foreground">Nova senha (mín. 6)</label>
                                        <input
                                            value={senha}
                                            onChange={(e) => setSenha(e.target.value)}
                                            className={inputCls}
                                            placeholder="Digite uma senha"
                                            type="password"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                                        <button
                                            className={btnOutline + " w-full"}
                                            onClick={() =>
                                                onUpsertAccess({
                                                    cpf: cpfDigits,
                                                    senha,
                                                    email,
                                                    telefone,
                                                })
                                            }
                                            disabled={!cpfDigits || senha.trim().length < 6}
                                            title="Cria se não existe; atualiza se existir"
                                        >
                                            <IconShieldLock className="size-4" />
                                            Salvar Acesso
                                        </button>

                                        <button
                                            className={btnNeutral + " w-full"}
                                            onClick={() => onResetAccess(cpfDigits)}
                                            disabled={!cpfDigits || !hasAccess}
                                            title="Gera senha temporária e envia por e-mail"
                                        >
                                            <IconLock className="size-4" />
                                            Resetar Senha
                                        </button>
                                    </div>

                                    <div className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
                                        <IconInfoCircle className="size-4 shrink-0 mt-[1px]" />
                                        <span>
                                            Reset envia uma senha temporária para o e-mail cadastrado no acesso.
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Beneficiário */}
                    <div className="mt-4 rounded-2xl border bg-card/60 p-4">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <IconFileText className="size-5 text-muted-foreground" />
                            Dados do Beneficiário (Unypax)
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                            Retorno bruto do endpoint /convenio/beneficiario.
                        </div>

                        <pre className="mt-3 max-h-[340px] overflow-auto rounded-xl border bg-background p-3 text-xs">
                            {JSON.stringify(detail?.beneficiario ?? null, null, 2)}
                        </pre>
                    </div>

                    {/* Contas a receber */}
                    <div className="mt-4 rounded-2xl border bg-card/60 p-4">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <IconCash className="size-5 text-muted-foreground" />
                            Contas a Receber (Unypax)
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                            Itens retornados do SearchAsync de contas a receber.
                        </div>

                        {contas.length === 0 ? (
                            <div className="mt-3 rounded-xl border bg-background p-3 text-sm text-muted-foreground">
                                Nenhuma conta a receber retornada para este contrato (ou o endpoint retornou outro formato).
                            </div>
                        ) : (
                            <div className="mt-3 overflow-auto rounded-xl border bg-background">
                                <table className="w-full text-sm">
                                    <thead className="border-b bg-muted/30">
                                        <tr>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">ID</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Situação</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Parcela</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Vencimento</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Valor</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Cobrança</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contas.map((c) => (
                                            <tr key={c.id} className="border-b last:border-0">
                                                <td className="px-3 py-2">{c.id}</td>
                                                <td className="px-3 py-2">{c.situacao}</td>
                                                <td className="px-3 py-2">{c.parcela ?? "-"}</td>
                                                <td className="px-3 py-2">
                                                    {c.dataVencimento ? fmtDate(c.dataVencimento) : "-"}
                                                </td>
                                                <td className="px-3 py-2">{fmtMoneyBR(c.valor)}</td>
                                                <td className="px-3 py-2">{c.cobranca ?? "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
                                Ver JSON bruto
                            </summary>
                            <pre className="mt-2 max-h-[260px] overflow-auto rounded-xl border bg-background p-3 text-xs">
                                {JSON.stringify(detail?.contas_receber ?? null, null, 2)}
                            </pre>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =========================
   Page principal (SEM X-Admin-Key)
========================= */
export default function AssociadosGeralPage() {
    // busca
    const [query, setQuery] = useState("");
    const [situacao, setSituacao] = useState("2,3,6,7,8,9,1,4,5"); // default amplo
    const [page, setPage] = useState(1);
    const pageSize = 10;

    // lista
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // detalhes
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selected, setSelected] = useState<Contract | null>(null);
    const [detail, setDetail] = useState<ContractDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // headers SEM X-Admin-Key
    const headers = useMemo(() => {
        return {
            "Content-Type": "application/json",
        } as Record<string, string>;
    }, []);

    const loadContracts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const url = new URL(ENDPOINT);
            url.searchParams.set("op", "contracts");
            url.searchParams.set("page", String(page));
            url.searchParams.set("pageSize", String(pageSize));
            url.searchParams.set("situacao", situacao);
            url.searchParams.set("textToSearch", query.trim());

            const res = await fetch(url.toString(), {
                method: "GET",
                headers,
                cache: "no-store",
            });
            const data = await safeJson(res);

            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Erro ao carregar contratos.");
            }

            setContracts(normalizeContractsPayload(data));
        } catch (e: any) {
            setError(e?.message || "Falha ao carregar.");
            setContracts([]);
        } finally {
            setLoading(false);
        }
    }, [headers, page, pageSize, query, situacao]);

    const openDetail = useCallback(
        async (c: Contract) => {
            setSelected(c);
            setDrawerOpen(true);
            setDetail(null);

            const cpfDigits = onlyDigits(c.cpf_cnpj || "");
            const idContrato = Number(c.id);

            try {
                setLoadingDetail(true);

                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "contract_detail");
                if (idContrato > 0) url.searchParams.set("idContrato", String(idContrato));
                if (cpfDigits) url.searchParams.set("cpf", cpfDigits);

                const res = await fetch(url.toString(), {
                    method: "GET",
                    headers,
                    cache: "no-store",
                });
                const data = await safeJson(res);

                if (!res.ok || !data?.ok) {
                    throw new Error(data?.error || "Erro ao carregar detalhes.");
                }
                setDetail(data as ContractDetail);
            } catch (e: any) {
                toastMessage("err", e?.message || "Erro ao carregar detalhes.");
                setDetail(null);
            } finally {
                setLoadingDetail(false);
            }
        },
        [headers]
    );

    const reloadDetail = useCallback(async () => {
        if (!selected) return;
        await openDetail(selected);
    }, [openDetail, selected]);

    const upsertAccess = useCallback(
        async (payload: { cpf: string; senha: string; email: string; telefone: string }) => {
            if (!payload.cpf || payload.cpf.length !== 11) {
                toastMessage("warn", "CPF inválido.");
                return;
            }
            if ((payload.senha || "").trim().length < 6) {
                toastMessage("warn", "Senha muito curta (mín. 6).");
                return;
            }

            try {
                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "upsert_access");

                const res = await fetch(url.toString(), {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                    cache: "no-store",
                });

                const data = await safeJson(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar acesso.");

                toastMessage("ok", data.created ? "Acesso criado com sucesso!" : "Acesso atualizado com sucesso!");
                await reloadDetail();
            } catch (e: any) {
                toastMessage("err", e?.message || "Erro ao salvar acesso.");
            }
        },
        [headers, reloadDetail]
    );

    const resetAccess = useCallback(
        async (cpf: string) => {
            if (!cpf || cpf.length !== 11) {
                toastMessage("warn", "CPF inválido.");
                return;
            }

            if (!confirm("Confirmar reset? Será gerada uma senha temporária e enviada por e-mail.")) return;

            try {
                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "reset_access");

                const res = await fetch(url.toString(), {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ cpf }),
                    cache: "no-store",
                });

                const data = await safeJson(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao resetar.");

                const temp = data?.temp_password ? `\n\nSenha temporária: ${data.temp_password}` : "";
                toastMessage("ok", `Reset concluído. Email: ${data?.email || "-"}.${temp}`);

                await reloadDetail();
            } catch (e: any) {
                toastMessage("err", e?.message || "Erro ao resetar senha.");
            }
        },
        [headers, reloadDetail]
    );

    const hasResults = contracts.length > 0;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
            {/* Topbar */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Associados — Consulta Geral</h1>
                    <p className="text-sm text-muted-foreground">
                        Unypax (contratos/financeiro) + banco local (acesso do app).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={loadContracts} className={btnNeutral} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="mb-5 rounded-2xl border bg-card/60 p-4">
                <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                        <label className="text-xs text-muted-foreground">Buscar (CPF, nome ou contrato)</label>
                        <div className="relative mt-1">
                            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Digite aqui… (textToSearch)"
                                className={inputCls + " pl-9"}
                            />
                        </div>
                    </div>

                    <div className="lg:col-span-4">
                        <label className="text-xs text-muted-foreground">Situações (IDs por vírgula)</label>
                        <input
                            value={situacao}
                            onChange={(e) => {
                                setSituacao(e.target.value);
                                setPage(1);
                            }}
                            className={inputCls + " mt-1"}
                            placeholder="Ex: 2,3,6"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                            2=ATIVO • 3=INADIMPLENTE • 6=BLOQUEADO • 9=CANCELADO (etc)
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex items-end">
                        <button
                            onClick={() => {
                                setPage(1);
                                loadContracts();
                            }}
                            className={btnOutline + " w-full"}
                        >
                            <IconSearch className="size-4" />
                            Buscar
                        </button>
                    </div>
                </div>
            </div>

            {/* Estado */}
            {loading && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    Carregando contratos…
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            )}

            {/* Lista */}
            {!hasResults && !loading ? (
                <div className="rounded-2xl border bg-card/60 p-5 text-sm text-muted-foreground">
                    Nenhum contrato retornado. Dica: busque por CPF (somente números), parte do nome ou contrato em “textToSearch”.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {contracts.map((c: any) => (
                        <ContractCard
                            key={c.id ?? `${c.contrato_numero}-${c.cpf_cnpj}`}
                            item={c}
                            onOpen={openDetail}
                        />
                    ))}
                </div>
            )}

            {/* Paginação */}
            <Pager
                page={page}
                onPrev={() => {
                    setPage((p) => Math.max(1, p - 1));
                    // garante usar a nova page
                    setTimeout(loadContracts, 0);
                }}
                onNext={() => {
                    setPage((p) => p + 1);
                    setTimeout(loadContracts, 0);
                }}
                disabledPrev={page <= 1 || loading}
                disabledNext={loading}
            />

            {/* Drawer */}
            <DetailDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                contract={selected}
                detail={detail}
                loading={loadingDetail}
                onReload={reloadDetail}
                onUpsertAccess={upsertAccess}
                onResetAccess={resetAccess}
            />
        </div>
    );
}