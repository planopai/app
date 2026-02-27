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
    IconFilter,
    IconEraser,
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

const selectCls =
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

    // 🔎 possíveis flags vindas da API (tolerância)
    has_access?: boolean | number | string;
    tem_acesso?: boolean | number | string;
    acesso?: boolean | number | string;
    local_auth?: any;
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
   Beneficiário model (API)
========================= */
type BeneficiarioApi = {
    Tipo?: "T" | "D" | "A" | "P" | string;
    Nome?: string;
    DataNascimento?: string;
    Sexo?: "F" | "M" | "N" | string;
    Telefone?: string;

    // tolerância para variações
    tipo?: "T" | "D" | "A" | "P" | string;
    nome?: string;
    dataNascimento?: string;
    sexo?: "F" | "M" | "N" | string;
    telefone?: string;
    celular?: string;
};

/* =========================
   Utils
========================= */
const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const toUpperTrim = (v: unknown) => String(v ?? "").trim().toUpperCase();

const safeText = (v: unknown) => {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s ? s : "-";
};

const fmtDateBR = (v: unknown) => {
    if (!v) return "-";
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};

const fmtDateTimeBR = (v: unknown) => {
    if (!v) return "-";
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
};

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

function accessBadge(hasAccess: boolean) {
    return (
        badge +
        " " +
        (hasAccess
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200")
    );
}

function inferHasAccessFromListItem(c: Contract): boolean {
    const anyC: any = c as any;

    const raw = anyC?.has_access ?? anyC?.tem_acesso ?? anyC?.acesso ?? (anyC?.local_auth ? 1 : 0);

    if (raw === undefined || raw === null) return false;

    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw > 0;

    const s = String(raw).trim().toLowerCase();
    return s === "1" || s === "true" || s === "sim" || s === "yes" || s === "ok";
}

async function safeJson<T = any>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

function normalizeContractsPayload(data: any): Contract[] {
    const raw = data?.data;
    if (Array.isArray(raw)) return raw;
    if (raw?.data && Array.isArray(raw.data)) return raw.data;
    if (raw?.items && Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(data)) return data;
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
        const t = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}

function parseXPagination(headers: Headers): PaginationInfo | null {
    const raw = headers.get("x-pagination") || headers.get("X-Pagination");
    if (!raw) return null;
    try {
        const j = JSON.parse(raw);
        return {
            pageNumber: Number(j.pageNumber ?? 1) || 1,
            pageSize: Number(j.pageSize ?? 10) || 10,
            pageCount: j.pageCount ?? undefined,
            totalItemCount: j.totalItemCount ?? undefined,
            hasNextPage: j.hasNextPage ?? undefined,
            hasPreviousPage: j.hasPreviousPage ?? undefined,
            firstItemOnPage: j.firstItemOnPage ?? undefined,
            lastItemOnPage: j.lastItemOnPage ?? undefined,
        };
    } catch {
        return null;
    }
}

function isValidEmail(email: string) {
    const e = (email || "").trim().toLowerCase();
    return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidTelefoneBR(telefone: string) {
    const t = onlyDigits(telefone);
    return t.length === 10 || t.length === 11;
}

/* =========================
   Beneficiário parsing (Unypax)
========================= */
function extractBeneficiariosList(payload: any): BeneficiarioApi[] {
    if (!payload) return [];

    const normalizeItem = (x: any): BeneficiarioApi => {
        const Tipo = (x?.Tipo ?? x?.tipo ?? "") as BeneficiarioApi["Tipo"];
        const Nome = (x?.Nome ?? x?.nome ?? "") as string;
        const DataNascimento = (x?.DataNascimento ?? x?.dataNascimento ?? x?.data_nascimento ?? "") as string;
        const Sexo = (x?.Sexo ?? x?.sexo ?? "") as BeneficiarioApi["Sexo"];
        const Telefone = (x?.Telefone ?? x?.telefone ?? x?.celular ?? "") as string;
        return { Tipo, Nome, DataNascimento, Sexo, Telefone };
    };

    const looksLikeListItem = (x: any) =>
        x &&
        typeof x === "object" &&
        ("Tipo" in x ||
            "Nome" in x ||
            "DataNascimento" in x ||
            "Sexo" in x ||
            "Telefone" in x ||
            "tipo" in x ||
            "nome" in x ||
            "dataNascimento" in x ||
            "sexo" in x ||
            "telefone" in x ||
            "celular" in x);

    if (Array.isArray(payload)) return payload.filter(looksLikeListItem).map(normalizeItem);

    if (typeof payload === "object") {
        const candidates = [
            "ListaBeneficiarios",
            "listaBeneficiarios",
            "ListaBeneficiário",
            "listaBeneficiário",
            "Beneficiarios",
            "beneficiarios",
            "items",
            "itens",
            "data",
            "Data",
        ];

        for (const k of candidates) {
            const v = (payload as any)?.[k];
            if (Array.isArray(v)) {
                const arr = v.filter(looksLikeListItem).map(normalizeItem);
                if (arr.length) return arr;
            }
        }

        for (const key of Object.keys(payload)) {
            const v = (payload as any)[key];
            if (Array.isArray(v)) {
                const arr = v.filter(looksLikeListItem).map(normalizeItem);
                if (arr.length) return arr;
            }
        }
    }

    return [];
}

const pickTitularFromList = (list: BeneficiarioApi[]) =>
    list.find((b) => String(b.Tipo ?? b.tipo ?? "").toUpperCase() === "T") ?? null;

const pickDependentesFromList = (list: BeneficiarioApi[]) =>
    list.filter((b) => {
        const tipo = String(b.Tipo ?? b.tipo ?? "").toUpperCase();
        return tipo === "D" || tipo === "A" || tipo === "P";
    });

function sexoLabel(s: any) {
    const v = String(s || "").toUpperCase();
    if (v === "F") return "Feminino";
    if (v === "M") return "Masculino";
    if (v === "N") return "Não informado";
    return safeText(s);
}

function tipoLabel(t: any) {
    const v = String(t || "").toUpperCase();
    if (v === "T") return "Titular";
    if (v === "D") return "Dependente";
    if (v === "A") return "Agregado";
    if (v === "P") return "Pet";
    return safeText(t);
}

/* =========================
   Modal
========================= */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    maxWidth = "max-w-5xl",
    hideHeader = false,
}: {
    open: boolean;
    title?: string;
    subtitle?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    maxWidth?: string;
    hideHeader?: boolean;
}) {
    useEffect(() => {
        if (!open) return;

        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onEsc);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

            <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
                <div className={`relative w-full ${maxWidth} rounded-3xl border bg-background shadow-2xl`}>
                    <button
                        type="button"
                        onClick={onClose}
                        className={btnNeutral + " absolute right-3 top-3 z-10 !px-3 !py-2"}
                        title="Fechar"
                    >
                        <IconX className="size-4" />
                        <span className="hidden sm:inline">Fechar</span>
                    </button>

                    {!hideHeader ? (
                        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 pr-16">
                            <div className="min-w-0">
                                <div className="truncate text-lg font-bold">{title}</div>
                                {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
                            </div>
                        </div>
                    ) : null}

                    <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
                </div>
            </div>
        </div>
    );
}

/* =========================
   Access Modal
========================= */
function AccessModal({
    open,
    onClose,
    title,
    initialCpf,
    initialEmail,
    initialTelefone,
    cpfEditable,
    onSave,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    initialCpf: string;
    initialEmail?: string;
    initialTelefone?: string;
    cpfEditable: boolean;
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
    const telDigits = useMemo(() => onlyDigits(telefone), [telefone]);

    const cpfOk = cpfDigits.length === 11;
    const emailOk = isValidEmail(email);
    const telOk = isValidTelefoneBR(telefone);
    const senhaOk = senha.trim().length >= 6;

    const canSave = cpfOk && emailOk && telOk && senhaOk && !saving;

    const handleSave = useCallback(async () => {
        if (!cpfOk) return toastMessage("warn", "CPF inválido (precisa ter 11 dígitos).");
        if (!emailOk) return toastMessage("warn", "Informe um e-mail válido.");
        if (!telOk) return toastMessage("warn", "Informe um telefone válido com DDD (10 ou 11 dígitos).");
        if (!senhaOk) return toastMessage("warn", "Senha muito curta (mín. 6).");

        try {
            setSaving(true);
            await onSave({ cpf: cpfDigits, senha, email: email.trim(), telefone: telDigits });
            onClose();
        } finally {
            setSaving(false);
        }
    }, [cpfOk, emailOk, telOk, senhaOk, onSave, cpfDigits, senha, email, telDigits, onClose]);

    return (
        <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-xl">
            <div className={cardCls + " p-4"}>
                <div className="text-sm font-semibold flex items-center gap-2">
                    <IconLock className="size-5 text-muted-foreground" />
                    Criar / Atualizar acesso
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
                            disabled={!cpfEditable}
                            autoComplete="off"
                        />
                        <div className="text-xs text-muted-foreground">
                            {cpfEditable ? "Obrigatório (dependente não vem com CPF na API)." : "CPF do titular já definido."}
                        </div>
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">E-mail</label>
                        <input
                            className={inputCls}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@dominio.com"
                            inputMode="email"
                            autoComplete="email"
                        />
                        {!emailOk && email.trim() ? <div className="text-xs text-red-600">E-mail inválido.</div> : null}
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Telefone (DDD + número)</label>
                        <input
                            className={inputCls}
                            value={telefone}
                            onChange={(e) => setTelefone(e.target.value)}
                            placeholder="(00) 00000-0000"
                            inputMode="tel"
                            autoComplete="tel"
                        />
                        {!telOk && onlyDigits(telefone).length > 0 ? <div className="text-xs text-red-600">Telefone inválido.</div> : null}
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Senha</label>
                        <input
                            className={inputCls}
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            placeholder="Digite uma senha"
                            type="password"
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button className={btnNeutral + " w-full sm:w-auto"} onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button className={btnOutline + " w-full sm:w-auto"} onClick={handleSave} disabled={!canSave}>
                            <IconShieldLock className="size-4" />
                            {saving ? "Salvando..." : "Salvar acesso"}
                        </button>
                    </div>

                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <IconInfoCircle className="size-4 shrink-0 mt-[1px]" />
                        <span>Validações seguem as regras do servidor (e-mail e telefone obrigatórios).</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* =========================
   Lista contratos
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
                        {items.map((c) => {
                            const hasAccess = inferHasAccessFromListItem(c);
                            return (
                                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-3 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="grid size-8 place-items-center rounded-xl border bg-background/60">
                                                <IconUserCircle className="size-5 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold">{safeText(c.nome)}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Últ. pagto: {c.dataultimopagamento ? fmtDateTimeBR(c.dataultimopagamento) : "-"}
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
                                        <div className="flex flex-wrap gap-2">
                                            <span className={statusBadgeSituacao(c.situacao)}>
                                                <IconShieldLock className="size-3" />
                                                {safeText(c.situacao)}
                                            </span>

                                            <span className={accessBadge(hasAccess)}>
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
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        <button className={btnOutline} onClick={() => onOpen(c)}>
                                            Ver detalhes
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="md:hidden">
                <div className="divide-y">
                    {items.map((c) => {
                        const hasAccess = inferHasAccessFromListItem(c);
                        return (
                            <div key={c.id} className="p-3">
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
                                                {c.dataultimopagamento ? fmtDateTimeBR(c.dataultimopagamento) : "-"}
                                            </div>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className={statusBadgeSituacao(c.situacao)}>
                                                <IconShieldLock className="size-3" />
                                                {safeText(c.situacao)}
                                            </span>

                                            <span className={accessBadge(hasAccess)}>
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
                                        </div>
                                    </div>

                                    <button className={btnOutline + " shrink-0"} onClick={() => onOpen(c)}>
                                        Ver detalhes
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* =========================
   Pager
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
   Detail
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
    onOpenDepAccess: (dep: BeneficiarioApi) => void;
}) {
    const cpfDigits = useMemo(() => onlyDigits(contract?.cpf_cnpj || ""), [contract?.cpf_cnpj]);
    const local = detail?.local_auth ?? null;
    const hasAccess = !!local;

    const beneficiarios = useMemo(() => {
        const raw = (detail as any)?.beneficiario ?? (detail as any)?.beneficiarios ?? (detail as any)?.ListaBeneficiarios;
        const normalizedRaw = Array.isArray(raw) ? raw[0] : raw;
        return extractBeneficiariosList(normalizedRaw);
    }, [detail]);

    const titular = useMemo(() => pickTitularFromList(beneficiarios), [beneficiarios]);
    const dependentes = useMemo(() => pickDependentesFromList(beneficiarios), [beneficiarios]);

    const headerLine = useMemo(() => {
        return {
            nome: safeText(contract?.nome),
            cpf: safeText(contract?.cpf_cnpj),
            contrato: safeText(contract?.contrato_numero || contract?.contrato),
            situacao: safeText(contract?.situacao),
        };
    }, [contract]);

    return (
        <div className="grid gap-4">
            <div className={cardCls + " p-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-base font-semibold truncate">{headerLine.nome !== "-" ? headerLine.nome : "Detalhes do Associado"}</div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <IconId className="size-4" />
                                {headerLine.cpf}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="inline-flex items-center gap-1">
                                <IconFileText className="size-4" />
                                {headerLine.contrato}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className={statusBadgeSituacao(contract?.situacao)}>{headerLine.situacao}</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <button className={btnNeutral + " w-full sm:w-auto"} onClick={onReload} disabled={loading}>
                            <IconRefresh className="size-4" />
                            Atualizar
                        </button>

                        <button
                            className={btnNeutral + " w-full sm:w-auto"}
                            onClick={() => {
                                if (cpfDigits.length > 0) copyToClipboard(cpfDigits);
                            }}
                            disabled={cpfDigits.length === 0}
                            title="Copiar CPF (somente números)"
                        >
                            <IconCopy className="size-4" />
                            Copiar CPF
                        </button>
                    </div>
                </div>

                {loading ? <div className="mt-3 rounded-2xl border bg-muted/30 px-3 py-2 text-sm">Carregando detalhes…</div> : null}
            </div>

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
                                {contract?.dataultimopagamento ? fmtDateTimeBR(contract.dataultimopagamento) : "-"}
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
                                    <span className="font-medium text-foreground">Último login:</span>{" "}
                                    {local?.ultimo_login ? fmtDateTimeBR(local.ultimo_login) : "-"}
                                </div>
                                <div>
                                    <span className="font-medium text-foreground">Bloqueado até:</span>{" "}
                                    {local?.bloqueado_ate ? fmtDateTimeBR(local.bloqueado_ate) : "-"}
                                </div>
                            </div>

                            {titular ? (
                                <div className="pt-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Titular (Unypax):</span> {safeText(titular.Nome)} • Nasc:{" "}
                                    {fmtDateBR(titular.DataNascimento)} • Sexo: {sexoLabel(titular.Sexo)} • Tel: {safeText(titular.Telefone)}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                        <span className={accessBadge(hasAccess)}>
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

                        <button className={btnOutline + " w-full sm:w-auto"} onClick={onOpenTitularAccess}>
                            <IconLock className="size-4" />
                            Criar acesso
                        </button>
                    </div>
                </div>
            </div>

            <div className={cardCls + " overflow-hidden"}>
                <div className="border-b bg-muted/20 px-4 py-3 text-sm font-semibold flex items-center gap-2">
                    <IconUser className="size-4 text-muted-foreground" />
                    Beneficiários (Dependentes / Agregados / Pet)
                </div>

                <div className="p-4">
                    {dependentes.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Nenhum dependente retornado.</div>
                    ) : (
                        <>
                            <div className="hidden md:block overflow-auto rounded-2xl border bg-background">
                                <table className="w-full text-sm">
                                    <thead className="border-b bg-muted/30">
                                        <tr>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Tipo</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Nome</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Nascimento</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Sexo</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Telefone</th>
                                            <th className="px-3 py-2 text-right whitespace-nowrap">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dependentes.map((d, idx) => (
                                            <tr key={idx} className="border-b last:border-0">
                                                <td className="px-3 py-2">{tipoLabel(d.Tipo)}</td>
                                                <td className="px-3 py-2 font-medium">{safeText((d as any).Nome ?? (d as any).nome)}</td>
                                                <td className="px-3 py-2">{fmtDateBR((d as any).DataNascimento ?? (d as any).dataNascimento)}</td>
                                                <td className="px-3 py-2">{sexoLabel((d as any).Sexo ?? (d as any).sexo)}</td>
                                                <td className="px-3 py-2">{safeText((d as any).Telefone ?? (d as any).telefone)}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button className={btnOutline + " py-1.5"} onClick={() => onOpenDepAccess(d)}>
                                                        <IconLock className="size-4" />
                                                        Criar acesso
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="md:hidden grid gap-2">
                                {dependentes.map((d, idx) => (
                                    <div key={idx} className="rounded-2xl border bg-background p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs text-muted-foreground">{tipoLabel(d.Tipo)}</div>
                                                <div className="font-semibold truncate">{safeText((d as any).Nome ?? (d as any).nome ?? d.Nome)}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Nasc: {fmtDateBR((d as any).DataNascimento ?? (d as any).dataNascimento ?? d.DataNascimento)} • Sexo:{" "}
                                                    {sexoLabel((d as any).Sexo ?? (d as any).sexo ?? d.Sexo)}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    <span className="font-medium text-foreground">Tel:</span>{" "}
                                                    {safeText((d as any).Telefone ?? (d as any).telefone ?? d.Telefone)}
                                                </div>
                                            </div>

                                            <button className={btnOutline + " shrink-0 py-1.5"} onClick={() => onOpenDepAccess(d)}>
                                                <IconLock className="size-4" />
                                                Criar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================
   Page principal (com filtros)
========================= */
export default function AssociadosGeralPage() {
    // busca (digitando)
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query, 350);

    // filtros (selecionando)
    const [draftCidade, setDraftCidade] = useState("");
    const [draftPlano, setDraftPlano] = useState("");
    const [draftSituacao, setDraftSituacao] = useState("");

    // filtros aplicados (clicou Filtrar)
    const [appliedCidade, setAppliedCidade] = useState("");
    const [appliedPlano, setAppliedPlano] = useState("");
    const [appliedSituacao, setAppliedSituacao] = useState("");

    const [page, setPage] = useState(1);
    const pageSize = 10;

    const [pagination, setPagination] = useState<PaginationInfo | null>(null);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ✅ opções globais dos filtros (não dependem só da página atual)
    const [filterOptions, setFilterOptions] = useState<{
        cidades: string[];
        planos: string[]; // usamos "cobertura" quando existir
        situacoes: string[];
    }>({ cidades: [], planos: [], situacoes: [] });

    const [loadingFilters, setLoadingFilters] = useState(false);

    // detalhe
    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Contract | null>(null);
    const [detail, setDetail] = useState<ContractDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // acesso
    const [accessOpen, setAccessOpen] = useState(false);
    const [accessTitle, setAccessTitle] = useState("Criar acesso");
    const [accessCpf, setAccessCpf] = useState("");
    const [accessEmail, setAccessEmail] = useState("");
    const [accessTelefone, setAccessTelefone] = useState("");
    const [accessCpfEditable, setAccessCpfEditable] = useState(false);

    const headers = useMemo(() => ({ "Content-Type": "application/json" } as Record<string, string>), []);

    const listAbortRef = useRef<AbortController | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);

    // Cache de detalhes
    const detailCacheRef = useRef<Map<string, ContractDetail>>(new Map());

    // ✅ selects agora usam as opções globais
    const cidadeOptions = useMemo(() => filterOptions.cidades, [filterOptions.cidades]);
    const planoOptions = useMemo(() => filterOptions.planos, [filterOptions.planos]);
    const situacaoOptions = useMemo(() => filterOptions.situacoes, [filterOptions.situacoes]);

    const buildListUrl = useCallback(
        (pageNum: number) => {
            const url = new URL(ENDPOINT);
            url.searchParams.set("op", "contracts");
            url.searchParams.set("page", String(pageNum));
            url.searchParams.set("pageSize", String(pageSize));

            // busca
            url.searchParams.set("textToSearch", (debouncedQuery || "").trim());

            // filtros aplicados (se o backend suportar, ele filtra; se não suportar, o fallback do front garante)
            if (appliedCidade) url.searchParams.set("cidade", appliedCidade);

            // "Plano" do usuário = cobertura (BÁSICO/LIGHT/PADRÃO OURO…)
            // tentamos enviar como cobertura e como plano (backend pode aceitar um deles)
            if (appliedPlano) url.searchParams.set("plano", appliedPlano);

            if (appliedSituacao) url.searchParams.set("situacaoText", appliedSituacao);

            return url.toString();
        },
        [debouncedQuery, appliedCidade, appliedPlano, appliedSituacao]
    );

    const loadContracts = useCallback(
        async (opts?: { resetPage?: boolean }) => {
            const nextPage = opts?.resetPage ? 1 : page;
            if (opts?.resetPage) setPage(1);

            listAbortRef.current?.abort();
            const ac = new AbortController();
            listAbortRef.current = ac;

            try {
                setLoading(true);
                setError(null);

                const res = await fetch(buildListUrl(nextPage), {
                    method: "GET",
                    headers,
                    cache: "no-store",
                    signal: ac.signal,
                });

                const data = await safeJson<any>(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar contratos.");

                setContracts(normalizeContractsPayload(data));
                setPagination(parseXPagination(res.headers) ?? { pageNumber: nextPage, pageSize });
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setError(e?.message || "Falha ao carregar.");
                setContracts([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        },
        [buildListUrl, headers, page]
    );

    // ✅ carrega todas as opções de filtros varrendo todas as páginas
    const loadFilterOptions = useCallback(async () => {
        setLoadingFilters(true);
        try {
            const url = new URL(ENDPOINT);
            url.searchParams.set("op", "filter_options");

            const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
            const data = await safeJson<any>(res);
            if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar filtros");

            setFilterOptions({
                cidades: Array.isArray(data.cidades) ? data.cidades : [],
                planos: Array.isArray(data.planos) ? data.planos : [],
                situacoes: Array.isArray(data.situacoes) ? data.situacoes : [],
            });
        } catch (e: any) {
            toastMessage("err", e?.message || "Erro ao carregar filtros");
        } finally {
            setLoadingFilters(false);
        }
    }, [headers]);

    // inicial
    useEffect(() => {
        loadContracts({ resetPage: true });
        loadFilterOptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // busca (debounced) => recarrega
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery]);

    // paginação => recarrega
    useEffect(() => {
        loadContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // filtro aplicado => recarrega
    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedCidade, appliedPlano, appliedSituacao]);

    // fallback: caso o backend NÃO filtre, filtramos no front (na página atual)
    const filteredContracts = useMemo(() => {
        const cCity = toUpperTrim(appliedCidade);
        const cPlan = toUpperTrim(appliedPlano);
        const cSit = toUpperTrim(appliedSituacao);

        return contracts.filter((c) => {
            if (cCity && toUpperTrim(c.cidade) !== cCity) return false;

            // ✅ "Plano" do filtro = cobertura quando existir; senão plano
            const planLike = toUpperTrim(c.cobertura ?? c.plano);
            if (cPlan && planLike !== cPlan) return false;

            if (cSit && toUpperTrim(c.situacao) !== cSit) return false;
            return true;
        });
    }, [contracts, appliedCidade, appliedPlano, appliedSituacao]);

    const fetchDetail = useCallback(
        async (c: Contract) => {
            const cpfDigits = onlyDigits(c.cpf_cnpj || "");
            const idContrato = Number(c.id) || 0;
            const cacheKey = `${idContrato}|${cpfDigits}`;

            const cached = detailCacheRef.current.get(cacheKey);
            if (cached) setDetail(cached);

            detailAbortRef.current?.abort();
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

                const data = await safeJson<ContractDetail>(res);
                if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "Erro ao carregar detalhes.");

                detailCacheRef.current.set(cacheKey, data);
                setDetail(data);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                toastMessage("err", e?.message || "Erro ao carregar detalhes.");
                setDetail(cached ?? null);
            } finally {
                setLoadingDetail(false);
            }
        },
        [headers]
    );

    const openDetail = useCallback(
        async (c: Contract) => {
            setSelected(c);
            setModalOpen(true);

            const cpfDigits = onlyDigits(c.cpf_cnpj || "");
            const cacheKey = `${Number(c.id) || 0}|${cpfDigits}`;
            if (!detailCacheRef.current.has(cacheKey)) setDetail(null);

            await fetchDetail(c);
        },
        [fetchDetail]
    );

    const reloadDetail = useCallback(async () => {
        if (!selected) return;
        await fetchDetail(selected);
    }, [fetchDetail, selected]);

    const upsertAccess = useCallback(
        async (payload: { cpf: string; senha: string; email: string; telefone: string }) => {
            const cpf = onlyDigits(payload.cpf);
            const tel = onlyDigits(payload.telefone);
            const senha = (payload.senha || "").trim();
            const email = (payload.email || "").trim();

            if (cpf.length !== 11) return toastMessage("warn", "CPF inválido.");
            if (senha.length < 6) return toastMessage("warn", "Senha muito curta (mín. 6).");
            if (!isValidEmail(email)) return toastMessage("warn", "Informe um e-mail válido.");
            if (!isValidTelefoneBR(tel)) return toastMessage("warn", "Informe um telefone válido com DDD.");

            try {
                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "upsert_access");

                const res = await fetch(url.toString(), {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ cpf, senha, email, telefone: tel }),
                    cache: "no-store",
                });

                const data = await safeJson<any>(res);
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar acesso.");

                toastMessage("ok", data.created ? "Acesso criado com sucesso!" : "Acesso atualizado com sucesso!");
                await reloadDetail();
            } catch (e: any) {
                toastMessage("err", e?.message || "Erro ao salvar acesso.");
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

    const openDepAccess = useCallback((dep: BeneficiarioApi) => {
        const nome = safeText(dep?.Nome || dep?.nome || "Beneficiário");

        setAccessTitle(`Criar acesso (${nome})`);
        setAccessCpf("");
        setAccessEmail("");
        setAccessTelefone(dep?.Telefone || dep?.telefone || dep?.celular || "");
        setAccessCpfEditable(true);
        setAccessOpen(true);
    }, []);

    const totalContratos = pagination?.totalItemCount ?? 0;
    const hasResults = filteredContracts.length > 0;

    const applyFilters = useCallback(() => {
        setAppliedCidade(draftCidade);
        setAppliedPlano(draftPlano);
        setAppliedSituacao(draftSituacao);
        setPage(1);
    }, [draftCidade, draftPlano, draftSituacao]);

    const clearFilters = useCallback(() => {
        setDraftCidade("");
        setDraftPlano("");
        setDraftSituacao("");
        setAppliedCidade("");
        setAppliedPlano("");
        setAppliedSituacao("");
        setPage(1);
    }, []);

    return (
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-8 py-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Associados</h1>
                    
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => loadContracts()} className={btnNeutral} title="Atualizar" disabled={loading}>
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>

                    <button onClick={() => loadFilterOptions()} className={btnNeutral} title="Atualizar filtros" disabled={loadingFilters || loading}>
                        <IconRefresh className="size-4" />
                        Filtros
                    </button>
                </div>
            </div>

            {/* Busca + Filtros (select) */}
            <div className={cardCls + " p-4 mb-4"}>
                <div className="grid gap-3 lg:grid-cols-12">
                    {/* Busca */}
                    <div className="lg:col-span-5">
                        <label className="text-xs text-muted-foreground">Buscar (CPF, nome ou contrato)</label>
                        <div className="relative mt-1">
                            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite aqui…" className={inputCls + " pl-9"} />
                        </div>
                    </div>

                    {/* Cidade */}
                    <div className="lg:col-span-2">
                        <label className="text-xs text-muted-foreground">Cidade</label>
                        <select
                            className={selectCls + " mt-1"}
                            value={draftCidade}
                            onChange={(e) => setDraftCidade(e.target.value)}
                            disabled={loading || loadingFilters}
                        >
                            <option value="">Todas</option>
                            {cidadeOptions.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Plano (na prática: cobertura) */}
                    <div className="lg:col-span-2">
                        <label className="text-xs text-muted-foreground">Plano</label>
                        <select
                            className={selectCls + " mt-1"}
                            value={draftPlano}
                            onChange={(e) => setDraftPlano(e.target.value)}
                            disabled={loading || loadingFilters}
                        >
                            <option value="">Todos</option>
                            {planoOptions.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Situação */}
                    <div className="lg:col-span-2">
                        <label className="text-xs text-muted-foreground">Situação</label>
                        <select
                            className={selectCls + " mt-1"}
                            value={draftSituacao}
                            onChange={(e) => setDraftSituacao(e.target.value)}
                            disabled={loading || loadingFilters}
                        >
                            <option value="">Todas</option>
                            {situacaoOptions.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Botões */}
                    <div className="lg:col-span-1 flex items-end gap-2">
                        <button onClick={applyFilters} className={btnOutline + " w-full"} disabled={loading} title="Aplicar filtros">
                            <IconFilter className="size-4" />
                            Filtrar
                        </button>
                        <button onClick={clearFilters} className={btnNeutral} disabled={loading} title="Limpar filtros">
                            <IconEraser className="size-4" />
                        </button>
                    </div>
                </div>

                {/* resumo filtros */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className={badge + " border-muted bg-muted/20"}>
                        Total contratos: <span className="font-semibold text-foreground ml-1">{totalContratos || "-"}</span>
                    </span>

                    {appliedCidade || appliedPlano || appliedSituacao ? (
                        <span className={badge + " border-muted bg-muted/20"}>
                            Filtros:{" "}
                            <span className="font-semibold text-foreground ml-1">
                                {appliedCidade ? `Cidade=${appliedCidade}` : ""}
                                {appliedCidade && appliedPlano ? " • " : ""}
                                {appliedPlano ? `Plano=${appliedPlano}` : ""}
                                {(appliedCidade || appliedPlano) && appliedSituacao ? " • " : ""}
                                {appliedSituacao ? `Situação=${appliedSituacao}` : ""}
                            </span>
                        </span>
                    ) : (
                        <span className={badge + " border-muted bg-muted/20"}>
                            Filtros: <span className="font-semibold text-foreground ml-1">Nenhum</span>
                        </span>
                    )}

                    <span className={badge + " border-muted bg-muted/20"}>
                        Nesta página: <span className="font-semibold text-foreground ml-1">{filteredContracts.length}</span>
                    </span>

                    {loadingFilters ? (
                        <span className={badge + " border-muted bg-muted/20"}>
                            Carregando opções dos filtros…
                        </span>
                    ) : null}
                </div>
            </div>

            {loading ? <div className="mb-4 rounded-xl border bg-muted/30 px-3 py-2 text-sm">Carregando contratos…</div> : null}
            {error ? (
                <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            ) : null}

            {!hasResults && !loading ? (
                <div className={cardCls + " p-5 text-sm text-muted-foreground"}>Nenhum contrato retornado com os filtros atuais.</div>
            ) : (
                <ContractsTable items={filteredContracts} onOpen={openDetail} />
            )}

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

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} hideHeader maxWidth="max-w-5xl">
                <DetailModalContent
                    contract={selected}
                    detail={detail}
                    loading={loadingDetail}
                    onReload={reloadDetail}
                    onOpenTitularAccess={openTitularAccess}
                    onOpenDepAccess={openDepAccess}
                />
            </Modal>

            <AccessModal
                open={accessOpen}
                onClose={() => setAccessOpen(false)}
                title={accessTitle}
                initialCpf={accessCpf}
                initialEmail={accessEmail}
                initialTelefone={accessTelefone}
                cpfEditable={accessCpfEditable}
                onSave={upsertAccess}
            />
        </div>
    );
}