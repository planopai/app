/**
 * Associados (/associados) — lógica sem tela: tipos, conversões, beneficiários e paginação.
 * 27/10/2026: separado do page.tsx antigo SEM mudar o comportamento (mesmo código, só exportado).
 * O que era só de tela (selos, alert) saiu daqui; a tela nova fica em ./ui.tsx e nos componentes.
 */
import { useEffect, useState } from "react";

export const ENDPOINT = "https://api.planoassistencialintegrado.com.br/associados_geral.php";


/* =========================
   Types
========================= */
export type Contract = {
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

export type LocalAuth = {
    cpf: string;
    email: string;
    telefone: string;
    email_verificado: number;
    telefone_verificado: number;
    tentativas: number;
    bloqueado_ate: string | null;
    ultimo_login: string | null;
} | null;

export type ContractDetail = {
    ok: boolean;
    titular_cpf?: string;
    local_auth: LocalAuth;
    beneficiarios?: BeneficiarioApi[];
    beneficiarios_count?: number;
    access_map?: Record<
        string,
        Exclude<LocalAuth, null>
    >;
    beneficiario: any | null;
    beneficiario_error?: string | null;
    contas_receber: any | null;
};

export type PaginationInfo = {
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
export type BeneficiarioApi = {
    Tipo?: "T" | "D" | "A" | "P" | string;
    Nome?: string;
    CPF?: string;
    DataNascimento?: string;
    Sexo?: "F" | "M" | "N" | string;
    Telefone?: string;
    GrauParentesco?: string | null;

    // Tolerância para variações da API.
    tipo?: "T" | "D" | "A" | "P" | string;
    nome?: string;
    cpf?: string;
    Cpf?: string;
    cpfCnpj?: string;
    CpfCnpj?: string;
    cpf_cnpj?: string;
    CPFBeneficiario?: string;
    cpfBeneficiario?: string;
    documento?: string;
    dataNascimento?: string;
    sexo?: "F" | "M" | "N" | string;
    telefone?: string;
    celular?: string;
    grauParentesco?: string | null;

    local_auth?: LocalAuth;
    has_access?: boolean | number | string;
    cpf_disponivel?: boolean;
    access_token?: string;
};

/* =========================
   Utils
========================= */
export const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
export const toUpperTrim = (v: unknown) => String(v ?? "").trim().toUpperCase();

export const normalizeSearchText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();


export function fmtCpf(value?: string): string {
    const digits = onlyDigits(value || "");

    if (digits.length !== 11) {
        return value?.trim() || "-";
    }

    return digits.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        "$1.$2.$3-$4",
    );
}

export function getBeneficiarioCpf(
    beneficiario?: BeneficiarioApi | null,
): string {
    return onlyDigits(
        beneficiario?.CPF ??
        beneficiario?.cpf ??
        beneficiario?.Cpf ??
        beneficiario?.cpfCnpj ??
        beneficiario?.CpfCnpj ??
        beneficiario?.cpf_cnpj ??
        beneficiario?.CPFBeneficiario ??
        beneficiario?.cpfBeneficiario ??
        beneficiario?.documento ??
        "",
    );
}

export function getBeneficiarioTipo(
    beneficiario?: BeneficiarioApi | null,
): "T" | "D" | "A" | "P" | "" {
    const value = toUpperTrim(
        beneficiario?.Tipo ??
        beneficiario?.tipo ??
        "",
    );

    if (value === "T" || value === "TITULAR") {
        return "T";
    }

    if (
        value === "D" ||
        value === "DEPENDENTE" ||
        value === "DEPENDENTES"
    ) {
        return "D";
    }

    if (
        value === "A" ||
        value === "AGREGADO" ||
        value === "AGREGADOS"
    ) {
        return "A";
    }

    if (
        value === "P" ||
        value === "PET" ||
        value === "PETS"
    ) {
        return "P";
    }

    return "";
}

export function beneficiarioHasAccess(
    beneficiario?: BeneficiarioApi | null,
): boolean {
    if (beneficiario?.local_auth) return true;

    const raw = beneficiario?.has_access;

    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw > 0;

    const value = String(raw ?? "")
        .trim()
        .toLowerCase();

    return (
        value === "1" ||
        value === "true" ||
        value === "sim" ||
        value === "yes"
    );
}

export const safeText = (v: unknown) => {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s ? s : "-";
};

export const fmtDateBR = (v: unknown) => {
    if (!v) return "-";
    // 27/10/2026: "1990-05-01" era lido como UTC e aparecia um dia antes (30/04). Agora a data vale como está.
    const d = parseDataLocal(v);
    return d ? d.toLocaleDateString("pt-BR") : String(v);
};

export const fmtDateTimeBR = (v: unknown) => {
    if (!v) return "-";
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
};





export function inferHasAccessFromListItem(c: Contract): boolean {
    const anyC: any = c as any;

    const raw = anyC?.has_access ?? anyC?.tem_acesso ?? anyC?.acesso ?? (anyC?.local_auth ? 1 : 0);

    if (raw === undefined || raw === null) return false;

    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw > 0;

    const s = String(raw).trim().toLowerCase();
    return s === "1" || s === "true" || s === "sim" || s === "yes" || s === "ok";
}

export async function safeJson<T = any>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

export function normalizeContractsPayload(data: any): Contract[] {
    const raw = data?.data;
    if (Array.isArray(raw)) return raw;
    if (raw?.data && Array.isArray(raw.data)) return raw.data;
    if (raw?.items && Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(data)) return data;
    return [];
}


export function useDebounced<T>(value: T, delayMs: number) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}

export function normalizePaginationObject(
    value: any,
    fallbackPage = 1,
    fallbackPageSize = 10,
): PaginationInfo | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const pick = (...keys: string[]) => {
        for (const key of keys) {
            const candidate = value?.[key];

            if (
                candidate !== undefined &&
                candidate !== null &&
                candidate !== ""
            ) {
                return candidate;
            }
        }

        return undefined;
    };

    const pageNumber =
        Number(
            pick(
                "pageNumber",
                "PageNumber",
                "currentPage",
                "CurrentPage",
                "currentPageNumber",
                "CurrentPageNumber",
            ) ?? fallbackPage,
        ) || fallbackPage;

    const pageSize =
        Number(
            pick(
                "pageSize",
                "PageSize",
                "itemsPerPage",
                "ItemsPerPage",
            ) ?? fallbackPageSize,
        ) || fallbackPageSize;

    const totalItemCount =
        Number(
            pick(
                "totalItemCount",
                "TotalItemCount",
                "totalCount",
                "TotalCount",
                "totalRecords",
                "TotalRecords",
                "recordCount",
                "RecordCount",
            ) ?? 0,
        ) || 0;

    let pageCount =
        Number(
            pick(
                "pageCount",
                "PageCount",
                "totalPages",
                "TotalPages",
            ) ?? 0,
        ) || 0;

    if (
        pageCount <= 0 &&
        totalItemCount > 0 &&
        pageSize > 0
    ) {
        pageCount = Math.ceil(
            totalItemCount / pageSize,
        );
    }

    const boolValue = (
        input: unknown,
        fallback: boolean,
    ) => {
        if (typeof input === "boolean") {
            return input;
        }

        if (typeof input === "number") {
            return input !== 0;
        }

        const normalized = String(input ?? "")
            .trim()
            .toLowerCase();

        if (
            ["true", "1", "yes", "sim"].includes(
                normalized,
            )
        ) {
            return true;
        }

        if (
            ["false", "0", "no", "nao", "não"].includes(
                normalized,
            )
        ) {
            return false;
        }

        return fallback;
    };

    const hasNextPage = boolValue(
        pick(
            "hasNextPage",
            "HasNextPage",
            "hasNext",
            "HasNext",
        ),
        pageCount > 0
            ? pageNumber < pageCount
            : false,
    );

    const hasPreviousPage = boolValue(
        pick(
            "hasPreviousPage",
            "HasPreviousPage",
            "hasPrevious",
            "HasPrevious",
        ),
        pageNumber > 1,
    );

    const firstItemOnPage =
        Number(
            pick(
                "firstItemOnPage",
                "FirstItemOnPage",
            ) ?? 0,
        ) || undefined;

    const lastItemOnPage =
        Number(
            pick(
                "lastItemOnPage",
                "LastItemOnPage",
            ) ?? 0,
        ) || undefined;

    return {
        pageNumber,
        pageSize,
        pageCount:
            pageCount > 0
                ? pageCount
                : undefined,
        totalItemCount,
        hasNextPage,
        hasPreviousPage,
        firstItemOnPage,
        lastItemOnPage,
    };
}

export function parseXPagination(
    headers: Headers,
    fallbackPage = 1,
    fallbackPageSize = 10,
): PaginationInfo | null {
    const raw =
        headers.get("x-pagination") ||
        headers.get("X-Pagination");

    if (!raw) return null;

    try {
        return normalizePaginationObject(
            JSON.parse(raw),
            fallbackPage,
            fallbackPageSize,
        );
    } catch {
        return null;
    }
}

export function isValidEmail(email: string) {
    const e = (email || "").trim().toLowerCase();
    return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function isValidTelefoneBR(telefone: string) {
    const t = onlyDigits(telefone);
    return t.length === 10 || t.length === 11;
}

/* =========================
   Beneficiário parsing (Unypax)
========================= */
export function extractBeneficiariosList(
    payload: unknown,
): BeneficiarioApi[] {
    if (!payload) return [];

    const output: BeneficiarioApi[] = [];
    const visited = new Set<unknown>();

    const normalizeItem = (
        value: unknown,
        inferredType: "" | "T" | "D" | "A" | "P" = "",
    ): BeneficiarioApi | null => {
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            return null;
        }

        const x = value as Record<string, unknown>;

        const Tipo = String(
            x.Tipo ??
            x.tipo ??
            x.TipoBeneficiario ??
            x.tipoBeneficiario ??
            inferredType,
        );

        const Nome = String(
            x.Nome ??
            x.nome ??
            x.NomeBeneficiario ??
            x.nomeBeneficiario ??
            "",
        ).trim();

        const normalizedType = getBeneficiarioTipo({
            Tipo,
        });

        if (
            !Nome ||
            !normalizedType
        ) {
            return null;
        }

        const CPF = onlyDigits(
            String(
                x.CPF ??
                x.cpf ??
                x.Cpf ??
                x.CPFCNPJ ??
                x.CpfCnpj ??
                x.cpfCnpj ??
                x.cpf_cnpj ??
                x.CPFBeneficiario ??
                x.cpfBeneficiario ??
                x.Documento ??
                x.documento ??
                "",
            ),
        );

        const DataNascimento = String(
            x.DataNascimento ??
            x.dataNascimento ??
            x.data_nascimento ??
            "",
        );

        const Sexo = String(
            x.Sexo ??
            x.sexo ??
            "",
        );

        const Telefone = String(
            x.Telefone ??
            x.telefone ??
            x.Fone ??
            x.fone ??
            x.Celular ??
            x.celular ??
            "",
        );

        const GrauParentesco =
            String(
                x.GrauParentesco ??
                x.grauParentesco ??
                x.Parentesco ??
                x.parentesco ??
                "",
            ).trim() || null;

        const localAuthRaw =
            x.local_auth ??
            x.localAuth ??
            null;

        const local_auth =
            localAuthRaw &&
                typeof localAuthRaw === "object"
                ? (localAuthRaw as Exclude<
                    LocalAuth,
                    null
                >)
                : null;

        const access_token = String(
            x.access_token ??
            x.accessToken ??
            "",
        ).trim();

        const hasAccessRaw =
            x.has_access ??
            x.tem_acesso ??
            x.acesso;

        const has_access:
            | boolean
            | number
            | string =
            typeof hasAccessRaw === "boolean" ||
                typeof hasAccessRaw === "number" ||
                typeof hasAccessRaw === "string"
                ? hasAccessRaw
                : Boolean(local_auth);

        return {
            Tipo: normalizedType,
            tipo: normalizedType,
            Nome,
            nome: Nome,
            CPF,
            cpf: CPF,
            DataNascimento,
            dataNascimento: DataNascimento,
            Sexo,
            sexo: Sexo,
            Telefone,
            telefone: Telefone,
            GrauParentesco,
            grauParentesco: GrauParentesco,
            local_auth,
            has_access,
            cpf_disponivel:
                CPF.length === 11,
            access_token,
        };
    };

    const inferTypeFromKey = (
        key: string,
    ): "" | "D" | "A" | "P" => {
        const normalized = key
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase();

        if (normalized.includes("DEPENDENTE")) {
            return "D";
        }

        if (normalized.includes("AGREGADO")) {
            return "A";
        }

        if (
            normalized === "PET" ||
            normalized === "PETS" ||
            normalized.includes("LISTAPET")
        ) {
            return "P";
        }

        return "";
    };

    const visit = (
        node: unknown,
        inheritedType: "" | "T" | "D" | "A" | "P" = "",
    ): void => {
        if (
            node &&
            typeof node === "object"
        ) {
            if (visited.has(node)) return;
            visited.add(node);
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                const normalized =
                    normalizeItem(
                        item,
                        inheritedType,
                    );

                if (normalized) {
                    output.push(normalized);
                }

                visit(item, inheritedType);
            }

            return;
        }

        if (
            !node ||
            typeof node !== "object"
        ) {
            return;
        }

        const normalized =
            normalizeItem(
                node,
                inheritedType,
            );

        if (normalized) {
            output.push(normalized);
        }

        for (const [key, value] of Object.entries(
            node as Record<string, unknown>,
        )) {
            if (
                Array.isArray(value) ||
                (
                    value &&
                    typeof value === "object"
                )
            ) {
                const inferred =
                    inferTypeFromKey(key);

                visit(
                    value,
                    inferred || inheritedType,
                );
            }
        }
    };

    visit(payload);

    const seen = new Set<string>();

    return output.filter((item) => {
        const cpf =
            getBeneficiarioCpf(item);
        const tipo =
            getBeneficiarioTipo(item);
        const nome =
            toUpperTrim(
                item.Nome ??
                item.nome,
            );
        const nascimento =
            String(
                item.DataNascimento ??
                item.dataNascimento ??
                "",
            );

        const key =
            cpf.length === 11
                ? `${tipo}:CPF:${cpf}`
                : `${tipo}:NOME:${nome}:${nascimento}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

export function mergeBeneficiariosLists(
    ...lists: BeneficiarioApi[][]
): BeneficiarioApi[] {
    const merged = new Map<
        string,
        BeneficiarioApi
    >();

    for (const list of lists) {
        for (const item of list) {
            const tipo =
                getBeneficiarioTipo(item);

            if (!tipo) continue;

            const nome = toUpperTrim(
                item.Nome ??
                item.nome ??
                "",
            );

            const nascimento = String(
                item.DataNascimento ??
                item.dataNascimento ??
                "",
            ).slice(0, 10);

            const key =
                `${tipo}|${nome}|${nascimento}`;

            const current =
                merged.get(key);

            if (!current) {
                merged.set(key, item);
                continue;
            }

            const currentCpf =
                getBeneficiarioCpf(current);
            const nextCpf =
                getBeneficiarioCpf(item);

            merged.set(key, {
                ...current,
                ...item,
                Tipo: tipo,
                tipo,
                Nome:
                    item.Nome ||
                    item.nome ||
                    current.Nome ||
                    current.nome,
                nome:
                    item.nome ||
                    item.Nome ||
                    current.nome ||
                    current.Nome,
                CPF:
                    nextCpf ||
                    currentCpf,
                cpf:
                    nextCpf ||
                    currentCpf,
                Telefone:
                    item.Telefone ||
                    item.telefone ||
                    item.celular ||
                    current.Telefone ||
                    current.telefone ||
                    current.celular,
                local_auth:
                    item.local_auth ||
                    current.local_auth ||
                    null,
                has_access:
                    beneficiarioHasAccess(item) ||
                    beneficiarioHasAccess(current),
                access_token:
                    item.access_token ||
                    current.access_token ||
                    "",
            });
        }
    }

    return Array.from(merged.values());
}

export const pickTitularFromList = (
    list: BeneficiarioApi[],
) =>
    list.find(
        (item) =>
            getBeneficiarioTipo(item) === "T",
    ) ?? null;

export const pickDependentesFromList = (
    list: BeneficiarioApi[],
) =>
    list.filter((item) => {
        const tipo =
            getBeneficiarioTipo(item);

        return (
            tipo === "D" ||
            tipo === "A" ||
            tipo === "P"
        );
    });

export function sexoLabel(s: any) {
    const v = String(s || "").toUpperCase();
    if (v === "F") return "Feminino";
    if (v === "M") return "Masculino";
    if (v === "N") return "Não informado";
    return safeText(s);
}

export function tipoLabel(t: any) {
    const v = String(t || "").toUpperCase();
    if (v === "T") return "Titular";
    if (v === "D") return "Dependente";
    if (v === "A") return "Agregado";
    if (v === "P") return "Pet";
    return safeText(t);
}

/* =========================
   Modal

/* =====================================================================
   27/10/2026 — apoio da tela nova
   ===================================================================== */

/** Data em horário local. Aceita "AAAA-MM-DD", "AAAA-MM-DD HH:MM[:SS]", ISO e "DD/MM/AAAA". */
export function parseDataLocal(v: unknown): Date | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
        return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
        const d = new Date(+m[3], +m[2] - 1, +m[1]);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

const DIA = 86400000;

/** Dias inteiros desde a data (hoje = 0; futuro = negativo). */
export function diasDesde(v: unknown): number | null {
    const d = parseDataLocal(v);
    if (!d) return null;
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const h = new Date();
    const b = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
    return Math.round((b - a) / DIA);
}

/** "hoje", "ontem", "há 12 dias", "há 3 meses". */
export function haQuanto(v: unknown): string {
    const n = diasDesde(v);
    if (n === null) return "—";
    if (n <= 0) return "hoje";
    if (n === 1) return "ontem";
    if (n < 60) return `há ${n} dias`;
    const meses = Math.round(n / 30);
    if (meses < 24) return `há ${meses} meses`;
    return `há ${Math.round(n / 365)} anos`;
}

export function idade(v: unknown): number | null {
    const d = parseDataLocal(v);
    if (!d) return null;
    const h = new Date();
    let a = h.getFullYear() - d.getFullYear();
    if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) a--;
    return a >= 0 && a < 130 ? a : null;
}

export function brl(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Telefone do Brasil formatado e número para o WhatsApp (com 55). */
export function formataFone(bruto: unknown): { texto: string; whats: string | null } {
    let d = onlyDigits(String(bruto ?? ""));
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
    if (d.length === 11) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`, whats: `55${d}` };
    if (d.length === 10) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`, whats: `55${d}` };
    const t = String(bruto ?? "").trim();
    return { texto: t || "—", whats: null };
}

/** Situação do contrato em grupo de cor. */
export type GrupoSituacao = "ativo" | "inadimplente" | "bloqueado" | "cancelado" | "outro";
export function grupoSituacao(s?: string): GrupoSituacao {
    const v = normalizeSearchText(s);
    if (v.includes("INADIMPL")) return "inadimplente";
    if (v.includes("BLOQUE") || v.includes("SUSPEN")) return "bloqueado";
    if (v.includes("CANCEL")) return "cancelado";
    if (v.includes("ATIV")) return "ativo";
    return "outro";
}

/* ---------------- Mensalidades (contas a receber da Unypax) ----------------
 * O contract_detail já devolve "contas_receber" (até 50 contas: P = em aberto, B = paga, C = cancelada),
 * do jeito que a Unypax manda. Aqui lemos com tolerância aos nomes de campo, como o associados_geral.php faz
 * (pai_finance_normalize_account / pai_finance_account_status).
 */
export type Mensalidade = {
    id: string;
    parcela: string;
    tipo: string;
    valor: number | null;
    valorPago: number | null;
    vencimento: Date | null;
    pagamento: Date | null;
    situacao: "aberta" | "vencida" | "paga" | "cancelada";
    diasAtraso: number;
};

function primeiro(row: any, chaves: string[]): any {
    for (const k of chaves) {
        const v = row?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
}

function dinheiro(v: unknown): number | null {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[^\d,.-]/g, "");
    if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return isFinite(n) ? n : null;
}

function listaDeContas(payload: unknown, nivel = 0): any[] {
    if (!payload || nivel > 4) return [];
    if (Array.isArray(payload)) return payload;
    if (typeof payload === "object") {
        for (const k of ["data", "items", "result", "results"]) {
            const v = (payload as any)[k];
            if (v && typeof v === "object") {
                const achou = listaDeContas(v, nivel + 1);
                if (achou.length) return achou;
            }
        }
    }
    return [];
}

export function lerMensalidades(contas: unknown): Mensalidade[] {
    const out: Mensalidade[] = [];
    for (const row of listaDeContas(contas)) {
        if (!row || typeof row !== "object") continue;
        const id = String(primeiro(row, ["ID", "Id", "id", "ContasReceberId", "contasReceberId"]) ?? "");
        const sitRaw = normalizeSearchText(primeiro(row, ["Situacao", "Situação", "situacao", "Status", "status"]) ?? "P");
        const venc = parseDataLocal(primeiro(row, ["DataVencimento", "dataVencimento", "Vencimento", "vencimento"]));
        const pag = parseDataLocal(
            primeiro(row, ["DataPagamento", "dataPagamento", "DataBaixa", "dataBaixa", "DataRecebimento", "dataRecebimento", "DataLiquidacao", "dataLiquidacao"]),
        );
        let situacao: Mensalidade["situacao"] = "aberta";
        if (sitRaw === "B" || sitRaw.startsWith("BAIX") || sitRaw.includes("PAGO") || sitRaw.includes("PAGA")) situacao = "paga";
        else if (sitRaw === "C" || sitRaw.startsWith("CANCEL")) situacao = "cancelada";
        const atraso = situacao === "aberta" && venc ? Math.max(0, diasDesde(venc) ?? 0) : 0;
        if (situacao === "aberta" && atraso > 0) situacao = "vencida";
        out.push({
            id: id || `${venc?.getTime() ?? out.length}`,
            parcela: String(primeiro(row, ["Parcela", "parcela", "Descricao", "descricao", "Historico", "historico"]) ?? "Mensalidade"),
            tipo: String(primeiro(row, ["Tipo", "tipo", "TipoTitulo", "tipoTitulo", "TipoConta", "tipoConta"]) ?? ""),
            valor: dinheiro(primeiro(row, ["Valor", "valor", "ValorTitulo", "valorTitulo"])),
            valorPago: dinheiro(primeiro(row, ["ValorPago", "valorPago", "ValorRecebido", "valorRecebido", "ValorBaixa", "valorBaixa"])),
            vencimento: venc,
            pagamento: pag,
            situacao,
            diasAtraso: atraso,
        });
    }
    return out;
}

export function resumoMensalidades(lista: Mensalidade[]) {
    const vencidas = lista.filter((m) => m.situacao === "vencida").sort((a, b) => (a.vencimento?.getTime() ?? 0) - (b.vencimento?.getTime() ?? 0));
    const abertas = lista.filter((m) => m.situacao === "aberta").sort((a, b) => (a.vencimento?.getTime() ?? 0) - (b.vencimento?.getTime() ?? 0));
    const pagas = lista
        .filter((m) => m.situacao === "paga")
        .sort((a, b) => (b.pagamento?.getTime() ?? b.vencimento?.getTime() ?? 0) - (a.pagamento?.getTime() ?? a.vencimento?.getTime() ?? 0));
    const totalVencido = vencidas.reduce((t, m) => t + (m.valor ?? 0), 0);
    return { vencidas, abertas, pagas, totalVencido, proxima: abertas[0] ?? null };
}
