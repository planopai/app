"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const ENDPOINT = "https://api.planoassistencialintegrado.com.br/associados_geral.php";

/* =========================
   UI styles
========================= */
const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

const btnOutline = btnBase + " border border-primary text-primary hover:bg-primary/5 active:bg-primary/10";
const btnNeutral = btnBase + " border border-muted text-foreground hover:bg-muted/40 active:bg-muted/50";
const btnDanger =
    btnBase +
    " border border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100 " +
    "dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-900/20";

const badge = "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold";
const inputCls =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none " +
    "focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition";

const cardCls = "rounded-2xl border bg-card shadow-sm";
const sectionTitle = "text-sm font-semibold";
const kvGrid = "grid gap-3 sm:grid-cols-2";

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
    beneficiario: any | null;
    contas_receber: any | null;
};

type PaginationInfo = {
    pageNumber: number;
    pageSize: number;
    pageCount?: number;
    totalItemCount?: number;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    firstItemOnPage?: number;
    lastItemOnPage?: number;
};

/* =========================
   Utils
========================= */
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

function parseDateMaybe(v: any): number | null {
    if (!v) return null;
    const d = new Date(String(v));
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
}

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s ? s : "-";
}

function statusBadgeSituacao(situacao?: string) {
    const s = (situacao || "").toUpperCase();
    if (s.includes("ATIVO"))
        return badge + " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200";
    if (s.includes("INADIMPL"))
        return badge + " border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200";
    if (s.includes("BLOQUE"))
        return badge + " border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200";
    if (s.includes("CANCEL"))
        return badge + " border-zinc-300 bg-zinc-50 text-zinc-800 dark:bg-zinc-900/20 dark:text-zinc-200";
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

function toastMessage(_kind: "ok" | "warn" | "err", msg: string) {
    alert(msg);
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toastMessage("ok", "Copiado para a área de transferência.");
    } catch {
        toastMessage("err", "Não foi possível copiar.");
    }
}

function useDebounced<T>(value: T, delayMs: number) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}

function uniqSorted(list: string[]) {
    const s = new Set(list.filter(Boolean).map((x) => x.trim()).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* =========================
   Situações (ID)
========================= */
const SITUACOES: { id: number; label: string }[] = [
    { id: 2, label: "Ativo" },
    { id: 3, label: "Inadimplente" },
    { id: 6, label: "Bloqueado" },
    { id: 9, label: "Cancelado" },
    { id: 1, label: "Pré-cadastro" },
    { id: 4, label: "Transferido" },
    { id: 5, label: "Em reabilitação" },
    { id: 7, label: "Quitado/Isento" },
    { id: 8, label: "Pré-cancelado" },
];

function toSituacaoCsv(ids: number[]) {
    return ids.join(",");
}

function parseXPagination(headers: Headers): PaginationInfo | null {
    const raw = headers.get("x-pagination") || headers.get("X-Pagination");
    if (!raw) return null;
    try {
        const j = JSON.parse(raw);
        const out: PaginationInfo = {
            pageNumber: Number(j.pageNumber ?? 1) || 1,
            pageSize: Number(j.pageSize ?? 10) || 10,
            pageCount: j.pageCount ?? undefined,
            totalItemCount: j.totalItemCount ?? undefined,
            hasNextPage: j.hasNextPage ?? undefined,
            hasPreviousPage: j.hasPreviousPage ?? undefined,
            firstItemOnPage: j.firstItemOnPage ?? undefined,
            lastItemOnPage: j.lastItemOnPage ?? undefined,
        };
        return out;
    } catch {
        return null;
    }
}

/* =========================
   Modal (centralizado)
========================= */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        function onEsc(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
                <div className="w-full max-w-5xl rounded-3xl border bg-background shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                        <div className="min-w-0">
                            <div className="truncate text-lg font-bold">{title}</div>
                            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
                        </div>
                        <button className={btnNeutral} onClick={onClose} title="Fechar">
                            <IconX className="size-4" />
                            Fechar
                        </button>
                    </div>
                    <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
                </div>
            </div>
        </div>
    );
}

/* =========================
   Helpers para render Beneficiário
========================= */
function pickTitular(benef: any) {
    if (!benef) return null;
    if (Array.isArray(benef)) return benef[0] ?? null;
    if (typeof benef === "object") return benef;
    return null;
}

function guessDependentes(benef: any): any[] {
    if (!benef) return [];
    const obj = Array.isArray(benef) ? benef[0] : benef;
    if (!obj || typeof obj !== "object") return [];
    // tentativas comuns
    const candidates = ["beneficiarios", "listaBeneficiarios", "dependentes", "itens", "items", "Beneficiarios"];
    for (const k of candidates) {
        const v = (obj as any)[k];
        if (Array.isArray(v)) return v;
    }
    return [];
}

/* =========================
   Lista (tabela) - desktop
   Lista (cards) - mobile
========================= */
function ContractsTable({
    items,
    onOpen,
}: {
    items: Contract[];
    onOpen: (c: Contract) => void;
}) {
    return (
        <div className={cardCls + " overflow-hidden"}>
            {/* Desktop table */}
            <div className="hidden md:block">
                <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                        <tr>
                            <th className="px-3 py-3 text-left">Nome</th>
                            <th className="px-3 py-3 text-left">CPF</th>
                            <th className="px-3 py-3 text-left">Contrato</th>
                            <th className="px-3 py-3 text-left">Plano</th>
                            <th className="px-3 py-3 text-left">Cidade</th>
                            <th className="px-3 py-3 text-left">Situação</th>
                            <th className="px-3 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => (
                            <tr key={c.id ?? `${c.contrato_numero}-${c.cpf_cnpj}`} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="grid size-8 place-items-center rounded-xl border bg-background/60">
                                            <IconUserCircle className="size-5 text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold">{safeText(c.nome)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                Últ. pagto: {c.dataultimopagamento ? fmtDate(c.dataultimopagamento) : "-"}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3">{safeText(c.cpf_cnpj)}</td>
                                <td className="px-3 py-3">{safeText(c.contrato_numero || c.contrato)}</td>
                                <td className="px-3 py-3">
                                    <div className="font-medium">{safeText(c.plano)}</div>
                                    <div className="text-xs text-muted-foreground">{c.cobertura ? safeText(c.cobertura) : ""}</div>
                                </td>
                                <td className="px-3 py-3">{safeText(c.cidade)}</td>
                                <td className="px-3 py-3">
                                    <span className={statusBadgeSituacao(c.situacao)}>
                                        <IconShieldLock className="size-3" />
                                        {safeText(c.situacao)}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <button className={btnOutline} onClick={() => onOpen(c)}>
                                        Ver detalhes
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden">
                <div className="divide-y">
                    {items.map((c) => (
                        <div key={c.id ?? `${c.contrato_numero}-${c.cpf_cnpj}`} className="p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="grid size-9 place-items-center rounded-xl border bg-background/60">
                                            <IconUserCircle className="size-5 text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold">{safeText(c.nome)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {safeText(c.cpf_cnpj)} • Contrato {safeText(c.contrato_numero || c.contrato)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-2 text-xs text-muted-foreground">
                                        <div>
                                            <span className="font-medium text-foreground">Plano:</span> {safeText(c.plano)}
                                            {c.cobertura ? ` • ${safeText(c.cobertura)}` : ""}
                                        </div>
                                        <div className="mt-0.5">
                                            <span className="font-medium text-foreground">Cidade:</span> {safeText(c.cidade)} •{" "}
                                            <span className="font-medium text-foreground">Últ. pagto:</span>{" "}
                                            {c.dataultimopagamento ? fmtDate(c.dataultimopagamento) : "-"}
                                        </div>
                                    </div>

                                    <div className="mt-2">
                                        <span className={statusBadgeSituacao(c.situacao)}>
                                            <IconShieldLock className="size-3" />
                                            {safeText(c.situacao)}
                                        </span>
                                    </div>
                                </div>

                                <button className={btnOutline + " shrink-0"} onClick={() => onOpen(c)}>
                                    Ver detalhes
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* =========================
   Pager + resumo (total etc)
========================= */
function Pager({
    page,
    pageCount,
    totalItemCount,
    pageSize,
    firstItemOnPage,
    lastItemOnPage,
    disabled,
    onPrev,
    onNext,
}: {
    page: number;
    pageCount?: number;
    totalItemCount?: number;
    pageSize: number;
    firstItemOnPage?: number;
    lastItemOnPage?: number;
    disabled: boolean;
    onPrev: () => void;
    onNext: () => void;
}) {
    const rangeText =
        totalItemCount && firstItemOnPage && lastItemOnPage
            ? `Mostrando ${firstItemOnPage}–${lastItemOnPage} de ${totalItemCount}`
            : totalItemCount
                ? `Total: ${totalItemCount}`
                : `Página ${page}`;

    return (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">{rangeText}</div>

            <div className="flex items-center justify-end gap-2">
                <button onClick={onPrev} disabled={disabled || page <= 1} className={btnNeutral}>
                    <IconChevronLeft className="size-4" />
                    Anterior
                </button>

                <div className="text-sm text-muted-foreground px-2">
                    Página <span className="font-semibold text-foreground">{page}</span>
                    {pageCount ? (
                        <>
                            {" "}
                            de <span className="font-semibold text-foreground">{pageCount}</span>
                        </>
                    ) : null}
                    {pageSize ? <span className="ml-2 text-xs">(por pág: {pageSize})</span> : null}
                </div>

                <button onClick={onNext} disabled={disabled || (pageCount ? page >= pageCount : false)} className={btnNeutral}>
                    Próximo
                    <IconChevronRight className="size-4" />
                </button>
            </div>
        </div>
    );
}

/* =========================
   Detail Modal content
========================= */
function DetailModalContent({
    contract,
    detail,
    loading,
    onReload,
    onUpsertAccess,
    onResetAccess,
}: {
    contract: Contract | null;
    detail: ContractDetail | null;
    loading: boolean;
    onReload: () => void;
    onUpsertAccess: (payload: { cpf: string; senha: string; email: string; telefone: string }) => Promise<void>;
    onResetAccess: (cpf: string) => Promise<void>;
}) {
    const cpfDigits = useMemo(() => onlyDigits(contract?.cpf_cnpj || ""), [contract?.cpf_cnpj]);
    const contas = useMemo(() => normalizeContasPayload(detail?.contas_receber), [detail?.contas_receber]);
    const local = detail?.local_auth ?? null;
    const hasAccess = !!local;

    const titular = useMemo(() => pickTitular(detail?.beneficiario), [detail?.beneficiario]);
    const dependentes = useMemo(() => guessDependentes(detail?.beneficiario), [detail?.beneficiario]);

    const [editAccess, setEditAccess] = useState(false);
    const [senha, setSenha] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");

    useEffect(() => {
        // sempre que trocar de beneficiário/detalhe, reseta o editor
        setEditAccess(false);
        setSenha("");
        if (detail?.local_auth) {
            setEmail(detail.local_auth.email || "");
            setTelefone(detail.local_auth.telefone || "");
        } else {
            setEmail("");
            setTelefone("");
        }
    }, [detail?.local_auth, contract?.id]);

    return (
        <div className="grid gap-4">
            {/* header actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <IconId className="size-4" />
                        {safeText(contract?.cpf_cnpj)}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="inline-flex items-center gap-1">
                        <IconFileText className="size-4" />
                        {safeText(contract?.contrato_numero || contract?.contrato)}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className={statusBadgeSituacao(contract?.situacao)}>{safeText(contract?.situacao)}</span>
                </div>

                <div className="flex gap-2">
                    <button className={btnNeutral} onClick={onReload}>
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                    <button
                        className={btnNeutral}
                        onClick={() => cpfDigits && copyToClipboard(cpfDigits)}
                        disabled={!cpfDigits}
                        title="Copiar CPF (somente números)"
                    >
                        <IconCopy className="size-4" />
                        Copiar CPF
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="rounded-2xl border bg-muted/30 px-3 py-2 text-sm">Carregando detalhes…</div>
            ) : null}

            {/* Resumo do contrato */}
            <div className={cardCls + " p-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-base font-semibold">Resumo do Plano</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                            <div>
                                <span className="font-medium text-foreground">Plano:</span> {safeText(contract?.plano)}
                                {contract?.cobertura ? ` • ${safeText(contract?.cobertura)}` : ""}
                            </div>
                            <div className="mt-0.5">
                                <span className="font-medium text-foreground">Cidade:</span> {safeText(contract?.cidade)} •{" "}
                                <span className="font-medium text-foreground">Últ. pagamento:</span>{" "}
                                {contract?.dataultimopagamento ? fmtDate(contract.dataultimopagamento) : "-"}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
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

                        <button className={btnOutline} onClick={() => setEditAccess((v) => !v)}>
                            <IconLock className="size-4" />
                            Criar acesso
                        </button>
                    </div>
                </div>

                {/* Editor de acesso */}
                {editAccess ? (
                    <div className="mt-4 grid gap-3">
                        <div className={kvGrid}>
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">E-mail</label>
                                <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@dominio.com" />
                            </div>
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Telefone (DDD + número)</label>
                                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} placeholder="(11) 99999-9999" />
                            </div>
                        </div>

                        <div className={kvGrid}>
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Nova senha (mín. 6)</label>
                                <input value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} placeholder="Digite uma senha" type="password" />
                            </div>
                            <div className="flex items-end gap-2">
                                <button
                                    className={btnOutline + " w-full"}
                                    onClick={() => onUpsertAccess({ cpf: cpfDigits, senha, email, telefone })}
                                    disabled={!cpfDigits || senha.trim().length < 6}
                                >
                                    <IconShieldLock className="size-4" />
                                    Salvar
                                </button>
                                <button className={btnNeutral + " w-full"} onClick={() => onResetAccess(cpfDigits)} disabled={!cpfDigits || !hasAccess}>
                                    <IconLock className="size-4" />
                                    Resetar senha
                                </button>
                            </div>
                        </div>

                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <IconInfoCircle className="size-4 shrink-0 mt-[1px]" />
                            <span>Reset envia uma senha temporária para o e-mail cadastrado no acesso.</span>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-2">
                            <IconMail className="size-4" />
                            <span className="font-medium text-foreground">Email:</span> {safeText(local?.email)}
                            {local?.email_verificado ? (
                                <span className={badge + " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"}>
                                    verificado
                                </span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <IconPhone className="size-4" />
                            <span className="font-medium text-foreground">Telefone:</span> {safeText(local?.telefone)}
                            {local?.telefone_verificado ? (
                                <span className={badge + " border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"}>
                                    verificado
                                </span>
                            ) : null}
                        </div>
                        <div>
                            <span className="font-medium text-foreground">Último login:</span> {local?.ultimo_login ? fmtDate(local.ultimo_login) : "-"}
                        </div>
                        <div>
                            <span className="font-medium text-foreground">Bloqueado até:</span> {local?.bloqueado_ate ? fmtDate(local.bloqueado_ate) : "-"}
                        </div>
                    </div>
                )}
            </div>

            {/* Beneficiário (organizado) */}
            <div className={cardCls + " p-4"}>
                <div className="flex items-center gap-2">
                    <IconFileText className="size-5 text-muted-foreground" />
                    <div className="text-base font-semibold">Dados do Beneficiário (Unypax)</div>
                </div>

                {!titular ? (
                    <div className="mt-3 rounded-2xl border bg-background p-3 text-sm text-muted-foreground">
                        Nenhum dado de beneficiário retornado.
                        <details className="mt-2">
                            <summary className="cursor-pointer font-semibold">Ver bruto</summary>
                            <pre className="mt-2 max-h-[280px] overflow-auto rounded-2xl border bg-muted/20 p-3 text-xs">
                                {JSON.stringify(detail?.beneficiario ?? null, null, 2)}
                            </pre>
                        </details>
                    </div>
                ) : (
                    <div className="mt-3 grid gap-4">
                        <div className={cardCls + " p-4 bg-background"}>
                            <div className="text-sm font-semibold mb-2">Titular</div>
                            <div className={kvGrid + " text-sm"}>
                                <div>
                                    <div className="text-xs text-muted-foreground">Nome</div>
                                    <div className="font-medium">{safeText(titular.nome)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Contrato</div>
                                    <div className="font-medium">{safeText(titular.numeroContrato || titular.contrato || titular.contrato_numero)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Plano / Cobertura</div>
                                    <div className="font-medium">{safeText(titular.planoCobertura || titular.planoCoberturaId || titular.planoCoberturaNome || titular.planoCobertura)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Situação</div>
                                    <div className="font-medium">{safeText(titular.contratoSituacao || titular.situacao)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">CPF</div>
                                    <div className="font-medium">{safeText(titular.cpf)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Nascimento</div>
                                    <div className="font-medium">{safeText(titular.dataNascimento)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Celular</div>
                                    <div className="font-medium">{safeText(titular.celular)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Telefone</div>
                                    <div className="font-medium">{safeText(titular.telefone)}</div>
                                </div>
                                <div className="sm:col-span-2">
                                    <div className="text-xs text-muted-foreground">Endereço</div>
                                    <div className="font-medium">
                                        {[
                                            titular.endereco || titular.endereço,
                                            titular.enderecoNumero,
                                            titular.enderecoBairro,
                                            titular.enderecoComplemento,
                                            titular.enderecoCidade,
                                            titular.enderecoUF,
                                            titular.enderecoCEP,
                                        ]
                                            .filter(Boolean)
                                            .map((x: any) => String(x).trim())
                                            .filter(Boolean)
                                            .join(" • ") || "-"}
                                    </div>
                                </div>
                            </div>

                            <details className="mt-3">
                                <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Ver JSON bruto</summary>
                                <pre className="mt-2 max-h-[260px] overflow-auto rounded-2xl border bg-muted/20 p-3 text-xs">
                                    {JSON.stringify(detail?.beneficiario ?? null, null, 2)}
                                </pre>
                            </details>
                        </div>

                        {/* Dependentes, se existirem */}
                        {dependentes.length > 0 ? (
                            <div className={cardCls + " overflow-hidden"}>
                                <div className="border-b bg-muted/20 px-4 py-3 text-sm font-semibold">Beneficiários / Dependentes</div>
                                <div className="overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b bg-muted/10">
                                            <tr>
                                                <th className="px-3 py-2 text-left whitespace-nowrap">Tipo</th>
                                                <th className="px-3 py-2 text-left whitespace-nowrap">Nome</th>
                                                <th className="px-3 py-2 text-left whitespace-nowrap">Nascimento</th>
                                                <th className="px-3 py-2 text-left whitespace-nowrap">Sexo</th>
                                                <th className="px-3 py-2 text-left whitespace-nowrap">Telefone</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dependentes.map((d: any, idx: number) => (
                                                <tr key={idx} className="border-b last:border-0">
                                                    <td className="px-3 py-2">{safeText(d.Tipo || d.tipo)}</td>
                                                    <td className="px-3 py-2">{safeText(d.Nome || d.nome)}</td>
                                                    <td className="px-3 py-2">{safeText(d.DataNascimento || d.dataNascimento)}</td>
                                                    <td className="px-3 py-2">{safeText(d.Sexo || d.sexo)}</td>
                                                    <td className="px-3 py-2">{safeText(d.Telefone || d.telefone)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {/* Contas a receber */}
            <div className={cardCls + " p-4"}>
                <div className="flex items-center gap-2">
                    <IconCash className="size-5 text-muted-foreground" />
                    <div className="text-base font-semibold">Contas a Receber (Unypax)</div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">Itens retornados do SearchAsync de contas a receber.</div>

                {contas.length === 0 ? (
                    <div className="mt-3 rounded-2xl border bg-background p-3 text-sm text-muted-foreground">
                        Nenhuma conta a receber retornada para este contrato (ou o endpoint retornou outro formato).
                        <details className="mt-2">
                            <summary className="cursor-pointer font-semibold">Ver bruto</summary>
                            <pre className="mt-2 max-h-[220px] overflow-auto rounded-2xl border bg-muted/20 p-3 text-xs">
                                {JSON.stringify(detail?.contas_receber ?? null, null, 2)}
                            </pre>
                        </details>
                    </div>
                ) : (
                    <div className="mt-3 overflow-auto rounded-2xl border bg-background">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/30">
                                <tr>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">ID</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Situação</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Parcela</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Vencimento</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Valor</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Cobrança</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">Linha digitável</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contas.map((c) => (
                                    <tr key={c.id} className="border-b last:border-0">
                                        <td className="px-3 py-2">{c.id}</td>
                                        <td className="px-3 py-2">{safeText(c.situacao)}</td>
                                        <td className="px-3 py-2">{safeText(c.parcela)}</td>
                                        <td className="px-3 py-2">{c.dataVencimento ? fmtDate(c.dataVencimento) : "-"}</td>
                                        <td className="px-3 py-2">{fmtMoneyBR(c.valor)}</td>
                                        <td className="px-3 py-2">{safeText(c.cobranca)}</td>
                                        <td className="px-3 py-2">
                                            {c.linhaDigitavel ? (
                                                <button className={btnNeutral + " py-1 px-2 text-xs"} onClick={() => copyToClipboard(String(c.linhaDigitavel))}>
                                                    <IconCopy className="size-4" />
                                                    Copiar
                                                </button>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/* =========================
   Page principal
========================= */
export default function AssociadosGeralPage() {
    // filtros
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query, 350);

    const [situacoesSel, setSituacoesSel] = useState<number[]>([2, 3, 6, 7, 8, 9, 1, 4, 5]);
    const [fCidade, setFCidade] = useState<string>("");
    const [fPlano, setFPlano] = useState<string>("");
    const [sortBy, setSortBy] = useState<"nome" | "ult_pagto" | "contrato">("nome");

    // paginação
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [pagination, setPagination] = useState<PaginationInfo | null>(null);

    // lista
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // modal detalhe
    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Contract | null>(null);
    const [detail, setDetail] = useState<ContractDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // headers
    const headers = useMemo(() => ({ "Content-Type": "application/json" } as Record<string, string>), []);

    // abort + cache
    const listAbortRef = useRef<AbortController | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);
    const detailCacheRef = useRef<Map<string, ContractDetail>>(new Map());

    const loadContracts = useCallback(
        async (opts?: { resetPage?: boolean }) => {
            const nextPage = opts?.resetPage ? 1 : page;
            if (opts?.resetPage) setPage(1);

            if (listAbortRef.current) listAbortRef.current.abort();
            const ac = new AbortController();
            listAbortRef.current = ac;

            try {
                setLoading(true);
                setError(null);

                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "contracts");
                url.searchParams.set("page", String(nextPage));
                url.searchParams.set("pageSize", String(pageSize));
                url.searchParams.set("situacao", toSituacaoCsv(situacoesSel));
                url.searchParams.set("textToSearch", (debouncedQuery || "").trim());

                const res = await fetch(url.toString(), {
                    method: "GET",
                    headers,
                    cache: "no-store",
                    signal: ac.signal,
                });

                const data = await safeJson(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar contratos.");

                setContracts(normalizeContractsPayload(data));

                const xp = parseXPagination(res.headers);
                if (xp) {
                    setPagination(xp);
                } else {
                    // fallback mínimo (se o backend não mandar X-Pagination)
                    setPagination({
                        pageNumber: nextPage,
                        pageSize,
                    });
                }
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setError(e?.message || "Falha ao carregar.");
                setContracts([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        },
        [debouncedQuery, headers, page, pageSize, situacoesSel]
    );

    // ✅ ao abrir a página, já carrega tudo
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // recarrega quando filtros principais mudam
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery, situacoesSel, pageSize]);

    // recarrega quando página muda
    useEffect(() => {
        loadContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const openDetail = useCallback(
        async (c: Contract) => {
            setSelected(c);
            setModalOpen(true);
            setDetail(null);

            const cpfDigits = onlyDigits(c.cpf_cnpj || "");
            const idContrato = Number(c.id);
            const cacheKey = `${idContrato || 0}|${cpfDigits || ""}`;

            const cached = detailCacheRef.current.get(cacheKey);
            if (cached) setDetail(cached);

            if (detailAbortRef.current) detailAbortRef.current.abort();
            const ac = new AbortController();
            detailAbortRef.current = ac;

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
                    signal: ac.signal,
                });

                const data = await safeJson(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar detalhes.");

                const detailObj = data as ContractDetail;
                detailCacheRef.current.set(cacheKey, detailObj);
                setDetail(detailObj);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
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
            if (!payload.cpf || payload.cpf.length !== 11) return toastMessage("warn", "CPF inválido.");
            if ((payload.senha || "").trim().length < 6) return toastMessage("warn", "Senha muito curta (mín. 6).");

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
            if (!cpf || cpf.length !== 11) return toastMessage("warn", "CPF inválido.");
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

    // dropdowns locais a partir do resultado atual
    const cidades = useMemo(() => uniqSorted(contracts.map((c) => c.cidade || "")), [contracts]);
    const planos = useMemo(() => uniqSorted(contracts.map((c) => c.plano || "")), [contracts]);

    // filtro local + ordenação
    const filteredContracts = useMemo(() => {
        let list = contracts.slice();

        if (fCidade) list = list.filter((c) => (c.cidade || "").trim() === fCidade);
        if (fPlano) list = list.filter((c) => (c.plano || "").trim() === fPlano);

        list.sort((a, b) => {
            if (sortBy === "nome") return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
            if (sortBy === "contrato")
                return String(a.contrato_numero || a.contrato || "").localeCompare(String(b.contrato_numero || b.contrato || ""), "pt-BR");
            const ta = parseDateMaybe(a.dataultimopagamento) ?? 0;
            const tb = parseDateMaybe(b.dataultimopagamento) ?? 0;
            return tb - ta;
        });

        return list;
    }, [contracts, fCidade, fPlano, sortBy]);

    const hasResults = filteredContracts.length > 0;

    const situacoesLabel = useMemo(() => {
        if (situacoesSel.length === SITUACOES.length) return "Todas";
        const labels = SITUACOES.filter((s) => situacoesSel.includes(s.id)).map((s) => s.label);
        return labels.length ? labels.join(", ") : "Nenhuma";
    }, [situacoesSel]);

    return (
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-8 py-5">
            {/* Topbar */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Associados — Consulta Geral</h1>
                    <p className="text-sm text-muted-foreground">Unypax (contratos/financeiro) + banco local (acesso do app).</p>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => loadContracts()} className={btnNeutral} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Filtros (tudo em selects, como você pediu) */}
            <div className={cardCls + " p-4 mb-4"}>
                <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <label className="text-xs text-muted-foreground">Buscar (CPF, nome ou contrato)</label>
                        <div className="relative mt-1">
                            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite aqui…" className={inputCls + " pl-9"} />
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        <label className="text-xs text-muted-foreground">Situação</label>
                        {/* select multiple (nativo, simples e confiável) */}
                        <select
                            multiple
                            value={situacoesSel.map(String)}
                            onChange={(e) => {
                                const values = Array.from(e.target.selectedOptions).map((o) => Number(o.value)).filter((n) => Number.isFinite(n));
                                setSituacoesSel(values.length ? values : []);
                                setPage(1);
                            }}
                            className={inputCls + " mt-1 h-[44px] sm:h-[120px]"}
                            title="Segure Ctrl (Windows) / Cmd (Mac) para selecionar múltiplos"
                        >
                            {SITUACOES.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                        <div className="mt-1 text-xs text-muted-foreground">Selecionado: {situacoesLabel}</div>
                    </div>

                    <div className="lg:col-span-2">
                        <label className="text-xs text-muted-foreground">Cidade</label>
                        <select className={inputCls + " mt-1"} value={fCidade} onChange={(e) => setFCidade(e.target.value)}>
                            <option value="">Todas</option>
                            {cidades.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>

                        <label className="text-xs text-muted-foreground mt-3 block">Plano</label>
                        <select className={inputCls + " mt-1"} value={fPlano} onChange={(e) => setFPlano(e.target.value)}>
                            <option value="">Todos</option>
                            {planos.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="lg:col-span-2">
                        <label className="text-xs text-muted-foreground">Ordenar</label>
                        <select className={inputCls + " mt-1"} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                            <option value="nome">Nome (A→Z)</option>
                            <option value="ult_pagto">Últ. pagamento (mais recente)</option>
                            <option value="contrato">Contrato</option>
                        </select>

                        <label className="text-xs text-muted-foreground mt-3 block">Itens por página</label>
                        <select
                            className={inputCls + " mt-1"}
                            value={String(pageSize)}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                setPageSize(Number.isFinite(n) ? n : 10);
                                setPage(1);
                            }}
                        >
                            {[10, 20, 50, 100].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>

                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                className={btnNeutral + " w-full"}
                                onClick={() => {
                                    setQuery("");
                                    setFCidade("");
                                    setFPlano("");
                                    setSortBy("nome");
                                    setSituacoesSel([2, 3, 6, 7, 8, 9, 1, 4, 5]);
                                    setPage(1);
                                    // já recarrega automaticamente pelos efeitos
                                }}
                            >
                                Limpar
                            </button>
                            <button type="button" className={btnOutline + " w-full"} onClick={() => loadContracts({ resetPage: true })}>
                                <IconSearch className="size-4" />
                                Buscar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Estado */}
            {loading ? <div className="mb-4 rounded-xl border bg-muted/30 px-3 py-2 text-sm">Carregando contratos…</div> : null}
            {error ? (
                <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            ) : null}

            {/* Lista (estilo tabela) */}
            {!hasResults && !loading ? (
                <div className={cardCls + " p-5 text-sm text-muted-foreground"}>
                    Nenhum contrato retornado. Dica: busque por CPF (somente números), parte do nome ou contrato.
                </div>
            ) : (
                <ContractsTable items={filteredContracts} onOpen={openDetail} />
            )}

            {/* Paginação + total (embaixo) */}
            <Pager
                page={pagination?.pageNumber ?? page}
                pageCount={pagination?.pageCount}
                totalItemCount={pagination?.totalItemCount}
                pageSize={pagination?.pageSize ?? pageSize}
                firstItemOnPage={pagination?.firstItemOnPage}
                lastItemOnPage={pagination?.lastItemOnPage}
                disabled={loading}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
            />

            {/* Modal central de detalhes */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={selected?.nome || "Detalhes do Associado"}
                subtitle={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                            <IconId className="size-4" />
                            {safeText(selected?.cpf_cnpj)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="inline-flex items-center gap-1">
                            <IconFileText className="size-4" />
                            {safeText(selected?.contrato_numero || selected?.contrato)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className={statusBadgeSituacao(selected?.situacao)}>{safeText(selected?.situacao)}</span>
                    </span>
                }
            >
                <DetailModalContent
                    contract={selected}
                    detail={detail}
                    loading={loadingDetail}
                    onReload={reloadDetail}
                    onUpsertAccess={upsertAccess}
                    onResetAccess={resetAccess}
                />
            </Modal>
        </div>
    );
}