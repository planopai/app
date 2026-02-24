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
};

/* =========================
   Utils
========================= */
function onlyDigits(v: string) {
    return (v || "").replace(/\D+/g, "");
}

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s ? s : "-";
}

function fmtDateBR(v: any) {
    if (!v) return "-";
    const s = String(v);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
    return s;
}

function fmtDateTimeBR(v: any) {
    if (!v) return "-";
    const s = String(v);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    return s;
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

function isValidEmail(email: string) {
    const e = (email || "").trim().toLowerCase();
    if (!e) return false;
    // validação básica no front (o PHP valida no servidor)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidTelefoneBR(telefone: string) {
    const t = onlyDigits(telefone);
    return t.length === 10 || t.length === 11;
}

/* =========================
   Beneficiário parsing (Unypax)
   - você disse que a API traz lista com Tipo/Nome/DataNascimento/Sexo/Telefone
   - esse helper tenta achar essa lista em vários formatos possíveis
========================= */
function extractBeneficiariosList(payload: any): BeneficiarioApi[] {
    if (!payload) return [];

    // ✅ MUITO COMUM: vir embrulhado em { data: ... } ou { Data: ... }
    const root = (payload?.data ?? payload?.Data ?? payload);

    // caso já venha array direto
    if (Array.isArray(root) && root.every((x) => x && typeof x === "object")) {
        const hasFields = root.some((x) => "Tipo" in x || "Nome" in x || "DataNascimento" in x || "tipo" in x || "nome" in x);
        if (hasFields) return root as BeneficiarioApi[];
    }

    // caso venha objeto com lista dentro
    if (root && typeof root === "object") {
        const candidates = [
            // ✅ nomes mais comuns
            "ListaBeneficiarios",
            "listaBeneficiarios",
            "Beneficiarios",
            "beneficiarios",

            // ✅ alguns retornos usam items/itens
            "items",
            "itens",

            // ✅ alguns retornos repetem data aqui dentro também
            "data",
            "Data",
        ];

        for (const k of candidates) {
            const v = (root as any)[k];
            if (Array.isArray(v)) {
                const hasFields = v.some(
                    (x) =>
                        x &&
                        typeof x === "object" &&
                        ("Tipo" in x || "Nome" in x || "DataNascimento" in x || "tipo" in x || "nome" in x)
                );
                if (hasFields) return v as BeneficiarioApi[];
            }
        }

        // fallback: varrer 1 nível
        for (const key of Object.keys(root)) {
            const v = (root as any)[key];
            if (Array.isArray(v)) {
                const hasFields = v.some(
                    (x) =>
                        x &&
                        typeof x === "object" &&
                        ("Tipo" in x || "Nome" in x || "DataNascimento" in x || "tipo" in x || "nome" in x)
                );
                if (hasFields) return v as BeneficiarioApi[];
            }
        }
    }

    return [];
}

function pickTitularFromList(list: BeneficiarioApi[]) {
    const t = list.find((b: any) => String(b?.Tipo ?? b?.tipo ?? "").toUpperCase() === "T");
    return t || null;
}

function pickDependentesFromList(list: BeneficiarioApi[]) {
    return list.filter((b: any) => String(b?.Tipo ?? b?.tipo ?? "").toUpperCase() !== "T");
}

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
   - validações iguais ao PHP:
     CPF 11, senha >= 6, email válido obrigatório, telefone 10/11 obrigatório
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

    async function handleSave() {
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
    }

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
                        />
                        <div className="text-xs text-muted-foreground">
                            {cpfEditable ? "Obrigatório (dependente não vem com CPF na API)." : "CPF do titular já definido."}
                        </div>
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">E-mail</label>
                        <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" inputMode="email" />
                        {!emailOk && email.trim() ? <div className="text-xs text-red-600">E-mail inválido.</div> : null}
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Telefone (DDD + número)</label>
                        <input className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" />
                        {!telOk && onlyDigits(telefone).length > 0 ? <div className="text-xs text-red-600">Telefone inválido.</div> : null}
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Senha</label>
                        <input className={inputCls} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite uma senha" type="password" />
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
                        <span>Validações do formulário seguem exatamente as regras do seu PHP (email e telefone obrigatórios).</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* =========================
   Lista contratos
========================= */
function ContractsTable({ items, onOpen }: { items: Contract[]; onOpen: (c: Contract) => void }) {
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
                        {items.map((c) => (
                            <tr key={c.id ?? `${c.contrato_numero}-${c.cpf_cnpj}`} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="grid size-8 place-items-center rounded-xl border bg-background/60">
                                            <IconUserCircle className="size-5 text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold">{safeText(c.nome)}</div>
                                            <div className="text-xs text-muted-foreground">Últ. pagto: {c.dataultimopagamento ? fmtDateTimeBR(c.dataultimopagamento) : "-"}</div>
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
                                            <span className="font-medium text-foreground">Últ. pagto:</span> {c.dataultimopagamento ? fmtDateTimeBR(c.dataultimopagamento) : "-"}
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
   Detail (Resumo + Dependentes)
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

    const beneficiarios = useMemo(
        () => extractBeneficiariosList(detail?.beneficiario ?? (detail as any)?.beneficiarios ?? (detail as any)?.ListaBeneficiarios),
        [detail]
    );
    const titular = useMemo(() => pickTitularFromList(beneficiarios), [beneficiarios]);
    const dependentes = useMemo(() => pickDependentesFromList(beneficiarios), [beneficiarios]);

    return (
        <div className="grid gap-4">
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
                    <button className={btnNeutral} onClick={() => cpfDigits && copyToClipboard(cpfDigits)} disabled={!cpfDigits} title="Copiar CPF (somente números)">
                        <IconCopy className="size-4" />
                        Copiar CPF
                    </button>
                </div>
            </div>

            {loading ? <div className="rounded-2xl border bg-muted/30 px-3 py-2 text-sm">Carregando detalhes…</div> : null}

            {/* Resumo (igual estilo sua imagem) */}
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
                                <span className="font-medium text-foreground">Últ. pagamento:</span> {contract?.dataultimopagamento ? fmtDateTimeBR(contract.dataultimopagamento) : "-"}
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
                                    <span className="font-medium text-foreground">Último login:</span> {local?.ultimo_login ? fmtDateTimeBR(local.ultimo_login) : "-"}
                                </div>
                                <div>
                                    <span className="font-medium text-foreground">Bloqueado até:</span> {local?.bloqueado_ate ? fmtDateTimeBR(local.bloqueado_ate) : "-"}
                                </div>
                            </div>

                            {/* info de titular vindo da lista (quando existir) */}
                            {titular ? (
                                <div className="pt-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Titular (Unypax):</span> {safeText(titular.Nome)} • Nasc:{" "}
                                    {fmtDateBR(titular.DataNascimento)} • Sexo: {sexoLabel(titular.Sexo)} • Tel: {safeText(titular.Telefone)}
                                </div>
                            ) : null}
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

            {/* Dependentes */}
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
                                                <div className="font-semibold truncate">{safeText(d.Nome)}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Nasc: {fmtDateBR(d.DataNascimento)} • Sexo: {sexoLabel(d.Sexo)}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    <span className="font-medium text-foreground">Tel:</span> {safeText(d.Telefone)}
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

    // modal acesso
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

    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadContracts({ resetPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery]);

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
            if (!payload.email || !isValidEmail(payload.email)) return toastMessage("warn", "Informe um e-mail válido.");
            if (!payload.telefone || !isValidTelefoneBR(payload.telefone)) return toastMessage("warn", "Informe um telefone válido com DDD.");

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
        const nome = safeText(dep?.Nome || "Beneficiário");

        setAccessTitle(`Criar acesso (${nome})`);
        setAccessCpf(""); // dependente não vem com CPF -> digita no modal
        setAccessEmail("");
        setAccessTelefone(dep?.Telefone || "");
        setAccessCpfEditable(true);
        setAccessOpen(true);
    }, []);

    const hasResults = contracts.length > 0;

    return (
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-8 py-5">
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

            {/* Só a busca */}
            <div className={cardCls + " p-4 mb-4"}>
                <label className="text-xs text-muted-foreground">Buscar (CPF, nome ou contrato)</label>
                <div className="relative mt-1">
                    <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite aqui…" className={inputCls + " pl-9"} />
                </div>
            </div>

            {loading ? <div className="mb-4 rounded-xl border bg-muted/30 px-3 py-2 text-sm">Carregando contratos…</div> : null}
            {error ? (
                <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            ) : null}

            {!hasResults && !loading ? (
                <div className={cardCls + " p-5 text-sm text-muted-foreground"}>
                    Nenhum contrato retornado. Dica: busque por CPF (somente números), parte do nome ou contrato.
                </div>
            ) : (
                <ContractsTable items={contracts} onOpen={openDetail} />
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