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
    IconUser,
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
const badge = "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold";

const inputCls =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none " +
    "focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition";

const cardCls = "rounded-2xl border bg-card shadow-sm";

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
   Helpers (Beneficiário / Dependentes)
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
    const candidates = ["beneficiarios", "listaBeneficiarios", "dependentes", "itens", "items", "Beneficiarios"];
    for (const k of candidates) {
        const v = (obj as any)[k];
        if (Array.isArray(v)) return v;
    }
    return [];
}

function getDepCpf(dep: any) {
    return onlyDigits(dep?.cpf || dep?.CPF || dep?.Cpf || dep?.cpf_cnpj || dep?.cpfCnpj || "");
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
    maxWidth = "max-w-5xl",
}: {
    open: boolean;
    title: string;
    subtitle?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    maxWidth?: string;
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
                <div className={`w-full ${maxWidth} rounded-3xl border bg-background shadow-2xl`}>
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
   Access Modal (Titular / Dependente)
========================= */
function AccessModal({
    open,
    onClose,
    title,
    initialCpf,
    initialEmail,
    initialTelefone,
    requireCpfEditable,
    onSave,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    initialCpf: string;
    initialEmail?: string;
    initialTelefone?: string;
    requireCpfEditable?: boolean; // dependente: true
    onSave: (payload: { cpf: string; senha: string; email: string; telefone: string }) => Promise<void>;
}) {
    const [cpf, setCpf] = useState(initialCpf);
    const [email, setEmail] = useState(initialEmail || "");
    const [telefone, setTelefone] = useState(initialTelefone || "");
    const [senha, setSenha] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setCpf(initialCpf);
        setEmail(initialEmail || "");
        setTelefone(initialTelefone || "");
        setSenha("");
    }, [open, initialCpf, initialEmail, initialTelefone]);

    const cpfDigits = useMemo(() => onlyDigits(cpf), [cpf]);

    async function handleSave() {
        const cpfOk = cpfDigits.length === 11;
        if (!cpfOk) return toastMessage("warn", "CPF inválido (precisa ter 11 dígitos).");
        if (senha.trim().length < 6) return toastMessage("warn", "Senha muito curta (mín. 6).");

        try {
            setSaving(true);
            await onSave({ cpf: cpfDigits, senha, email: email.trim(), telefone: telefone.trim() });
            onClose();
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-xl">
            <div className="grid gap-3">
                <div className={cardCls + " p-4"}>
                    <div className="text-sm font-semibold flex items-center gap-2">
                        <IconLock className="size-5 text-muted-foreground" />
                        Criar / Atualizar acesso
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        Informe os dados e defina a senha. (A senha precisa ter no mínimo 6 caracteres.)
                    </div>

                    <div className="mt-4 grid gap-3">
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">CPF</label>
                            <input
                                className={inputCls}
                                value={cpf}
                                onChange={(e) => setCpf(e.target.value)}
                                placeholder="000.000.000-00"
                                inputMode="numeric"
                                disabled={!requireCpfEditable}
                            />
                            {!requireCpfEditable ? (
                                <div className="text-xs text-muted-foreground">CPF do titular já definido.</div>
                            ) : (
                                <div className="text-xs text-muted-foreground">Obrigatório para criar o acesso do dependente.</div>
                            )}
                        </div>

                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">E-mail</label>
                            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" inputMode="email" />
                        </div>

                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Telefone</label>
                            <input className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" />
                        </div>

                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Senha</label>
                            <input className={inputCls} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite uma senha" type="password" />
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button className={btnNeutral + " w-full sm:w-auto"} onClick={onClose} disabled={saving}>
                                Cancelar
                            </button>
                            <button className={btnOutline + " w-full sm:w-auto"} onClick={handleSave} disabled={saving}>
                                <IconShieldLock className="size-4" />
                                {saving ? "Salvando..." : "Salvar acesso"}
                            </button>
                        </div>

                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <IconInfoCircle className="size-4 shrink-0 mt-[1px]" />
                            <span>Depois, você pode usar “Resetar senha” no titular (quando existir acesso) para gerar senha temporária.</span>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* =========================
   Lista (tabela) - desktop
   Lista (cards) - mobile
========================= */
function ContractsTable({ items, onOpen }: { items: Contract[]; onOpen: (c: Contract) => void }) {
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
   Detail (somente resumo + dependentes + criar acesso)
========================= */
function DetailModalContent({
    contract,
    detail,
    loading,
    onReload,
    onOpenTitularAccess,
    onOpenDepAccess,
}: {
    contract: Contract | null;
    detail: ContractDetail | null;
    loading: boolean;
    onReload: () => void;
    onOpenTitularAccess: () => void;
    onOpenDepAccess: (dep: any) => void;
}) {
    const cpfDigits = useMemo(() => onlyDigits(contract?.cpf_cnpj || ""), [contract?.cpf_cnpj]);
    const local = detail?.local_auth ?? null;
    const hasAccess = !!local;

    const titular = useMemo(() => pickTitular(detail?.beneficiario), [detail?.beneficiario]);
    const dependentes = useMemo(() => guessDependentes(detail?.beneficiario), [detail?.beneficiario]);

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

            {loading ? <div className="rounded-2xl border bg-muted/30 px-3 py-2 text-sm">Carregando detalhes…</div> : null}

            {/* Resumo do Plano (igual estilo da imagem) */}
            <div className={cardCls + " p-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-base font-semibold">Resumo do Plano</div>
                        <div className="mt-2 text-sm text-muted-foreground grid gap-1.5">
                            <div>
                                <span className="font-medium text-foreground">Plano:</span> {safeText(contract?.plano)}
                                {contract?.cobertura ? ` • ${safeText(contract?.cobertura)}` : ""}
                            </div>
                            <div>
                                <span className="font-medium text-foreground">Cidade:</span> {safeText(contract?.cidade)} •{" "}
                                <span className="font-medium text-foreground">Últ. pagamento:</span>{" "}
                                {contract?.dataultimopagamento ? fmtDate(contract.dataultimopagamento) : "-"}
                            </div>

                            <div className="pt-2 grid gap-2">
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
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
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
                                    <IconCheck className="size-3" /> Com acesso
                                </>
                            ) : (
                                <>
                                    <IconAlertTriangle className="size-3" /> Sem acesso
                                </>
                            )}
                        </span>

                        <button className={btnOutline} onClick={onOpenTitularAccess}>
                            <IconLock className="size-4" />
                            Criar acesso
                        </button>
                    </div>
                </div>
            </div>

            {/* Dependentes + criar acesso */}
            <div className={cardCls + " overflow-hidden"}>
                <div className="border-b bg-muted/20 px-4 py-3 text-sm font-semibold flex items-center gap-2">
                    <IconUser className="size-4 text-muted-foreground" />
                    Dependentes
                </div>

                <div className="p-4">
                    {dependentes.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                            Nenhum dependente retornado.
                            {!titular ? (
                                <div className="mt-2 text-xs text-muted-foreground">Obs.: o backend não retornou “beneficiario” (Unypax).</div>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            {/* Desktop */}
                            <div className="hidden md:block overflow-auto rounded-2xl border bg-background">
                                <table className="w-full text-sm">
                                    <thead className="border-b bg-muted/30">
                                        <tr>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Nome</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Nascimento</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Tipo</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">CPF</th>
                                            <th className="px-3 py-2 text-right whitespace-nowrap">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dependentes.map((d: any, idx: number) => {
                                            const nome = safeText(d.Nome || d.nome);
                                            const nasc = safeText(d.DataNascimento || d.dataNascimento);
                                            const tipo = safeText(d.Tipo || d.tipo);
                                            const cpf = getDepCpf(d);

                                            return (
                                                <tr key={idx} className="border-b last:border-0">
                                                    <td className="px-3 py-2 font-medium">{nome}</td>
                                                    <td className="px-3 py-2">{nasc}</td>
                                                    <td className="px-3 py-2">{tipo}</td>
                                                    <td className="px-3 py-2">{cpf ? cpf : <span className="text-muted-foreground">—</span>}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <button className={btnOutline + " py-1.5"} onClick={() => onOpenDepAccess(d)}>
                                                            <IconLock className="size-4" />
                                                            Criar acesso
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile */}
                            <div className="md:hidden grid gap-2">
                                {dependentes.map((d: any, idx: number) => {
                                    const nome = safeText(d.Nome || d.nome);
                                    const nasc = safeText(d.DataNascimento || d.dataNascimento);
                                    const tipo = safeText(d.Tipo || d.tipo);
                                    const cpf = getDepCpf(d);

                                    return (
                                        <div key={idx} className="rounded-2xl border bg-background p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-semibold truncate">{nome}</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {tipo} • Nasc: {nasc}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        <span className="font-medium text-foreground">CPF:</span> {cpf || "—"}
                                                    </div>
                                                </div>
                                                <button className={btnOutline + " shrink-0 py-1.5"} onClick={() => onOpenDepAccess(d)}>
                                                    <IconLock className="size-4" />
                                                    Criar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================
   Page principal
========================= */
export default function AssociadosGeralPage() {
    // busca (ÚNICO filtro)
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query, 350);

    // paginação
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
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

    // modal acesso (titular/dependente)
    const [accessOpen, setAccessOpen] = useState(false);
    const [accessTitle, setAccessTitle] = useState("Criar acesso");
    const [accessCpf, setAccessCpf] = useState("");
    const [accessEmail, setAccessEmail] = useState("");
    const [accessTelefone, setAccessTelefone] = useState("");
    const [accessCpfEditable, setAccessCpfEditable] = useState(false);

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

                // ✅ sem filtro de situação/cidade/plano/ordenar: só busca
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
                if (xp) setPagination(xp);
                else setPagination({ pageNumber: nextPage, pageSize });
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setError(e?.message || "Falha ao carregar.");
                setContracts([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        },
        [debouncedQuery, headers, page, pageSize]
    );

    // ✅ ao abrir a página, já carrega tudo
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // recarrega quando texto de busca muda
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery]);

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

    // (mantido, caso você use depois — não aparece na UI)
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

    const openTitularAccess = useCallback(() => {
        const cpf = onlyDigits(selected?.cpf_cnpj || "");
        const local = detail?.local_auth ?? null;

        setAccessTitle("Criar acesso (Titular)");
        setAccessCpf(cpf);
        setAccessEmail(local?.email || "");
        setAccessTelefone(local?.telefone || "");
        setAccessCpfEditable(false);
        setAccessOpen(true);
    }, [detail?.local_auth, selected?.cpf_cnpj]);

    const openDepAccess = useCallback((dep: any) => {
        const nome = safeText(dep?.Nome || dep?.nome || "Dependente");
        const cpf = getDepCpf(dep);

        setAccessTitle(`Criar acesso (${nome})`);
        setAccessCpf(cpf); // pode estar vazio
        setAccessEmail("");
        setAccessTelefone("");
        setAccessCpfEditable(true); // dependente precisa poder digitar CPF se não tiver
        setAccessOpen(true);
    }, []);

    const hasResults = contracts.length > 0;

    return (
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-8 py-5">
            {/* Topbar */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Associados — Consulta Geral</h1>
                    <p className="text-sm text-muted-foreground">Unypax (contratos) + banco local (acesso do app).</p>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => loadContracts()} className={btnNeutral} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* ✅ Só a busca (removendo todo o resto) */}
            <div className={cardCls + " p-4 mb-4"}>
                <label className="text-xs text-muted-foreground">Buscar (CPF, nome ou contrato)</label>
                <div className="relative mt-1">
                    <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Digite aqui…"
                        className={inputCls + " pl-9"}
                    />
                </div>
            </div>

            {/* Estado */}
            {loading ? <div className="mb-4 rounded-xl border bg-muted/30 px-3 py-2 text-sm">Carregando contratos…</div> : null}
            {error ? (
                <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            ) : null}

            {/* Lista */}
            {!hasResults && !loading ? (
                <div className={cardCls + " p-5 text-sm text-muted-foreground"}>
                    Nenhum contrato retornado. Dica: busque por CPF (somente números), parte do nome ou contrato.
                </div>
            ) : (
                <ContractsTable items={contracts} onOpen={openDetail} />
            )}

            {/* Paginação + total */}
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

            {/* Modal central de detalhes (somente resumo + dependentes) */}
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
                    onOpenTitularAccess={openTitularAccess}
                    onOpenDepAccess={openDepAccess}
                />
            </Modal>

            {/* Modal de criar acesso (titular/dependente) */}
            <AccessModal
                open={accessOpen}
                onClose={() => setAccessOpen(false)}
                title={accessTitle}
                initialCpf={accessCpf}
                initialEmail={accessEmail}
                initialTelefone={accessTelefone}
                requireCpfEditable={accessCpfEditable}
                onSave={upsertAccess}
            />
        </div>
    );
}