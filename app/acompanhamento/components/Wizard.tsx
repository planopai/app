"use client";

// UI ITENS: CHECKBOX SIM/NAO V2

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

type Step = {
    label: string;
    id: string;
    type:
    | "input"
    | "select"
    | "textarea"
    | "date"
    | "time"
    | "datalist"
    | "custom"
    | "file"
    | "async_urna"
    | "async_roupa"
    | "async_invol"
    | "async_veu"
    | "async_cordao";
    options?: string[];
    placeholder?: string;
    datalist?: string[];
    accept?: string;
};

type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

const ESTOQUE_API = `${ENDPOINT}/materiais_gerais.php`;

const SALAS_VELORIO = ["Sala 01", "Sala 02", "Sala 03"] as const;
const VELORIO_ONLINE_OPCOES = ["Sim", "Não"] as const;

/* -------------------- helpers -------------------- */
function normUpper(v: any) {
    return String(v ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function normNoAccLower(v: any) {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isRoupaPropria(v: any) {
    const s = normNoAccLower(v);
    return s === "roupa propria" || s === "roupa própria";
}

function isSimNao(v: string) {
    return v === "Sim" || v === "Não";
}

function getPidFromRow(it: EstoqueRow): number {
    return (
        Number((it as any).id ?? (it as any).produto_id ?? (it as any).est_produto_id ?? 0) || 0
    );
}

// key estável p/ lista do estoque (evita “clicar e não selecionar” / DOM reusado)
function getStableRowKey(it: EstoqueRow) {
    const pid = getPidFromRow(it);
    const cb = String((it as any).codigo_barras ?? "");
    const nome = String(it.nome ?? "");
    const saldo = String((it as any).saldo_total ?? "");
    return `${pid || "0"}|${cb}|${nome}|${saldo}`;
}

function isMobileCoarsePointer() {
    if (typeof window === "undefined") return false;
    try {
        return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    } catch {
        return false;
    }
}

function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
        reader.readAsDataURL(file);
    });
}

function normalizarFotoSrc(src: any): string {
    const s = String(src ?? "").trim();
    if (!s) return "";
    if (s.startsWith("data:")) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return `${ENDPOINT}${s}`;
    return `${ENDPOINT}/${s.replace(/^\/+/, "")}`;
}

type CheckboxChoiceOption = {
    value: string;
    label: string;
};

function CheckboxChoiceGroup({
    inputId,
    value,
    options,
    onChange,
    disabled,
    hasError,
    ariaLabel,
}: {
    inputId: string;
    value: string;
    options: readonly CheckboxChoiceOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    hasError?: boolean;
    ariaLabel: string;
}) {
    return (
        <div
            data-wizard-error={hasError ? "1" : "0"}
            className={[
                "rounded-lg border px-3 py-2",
                hasError ? "border-red-500 bg-red-50/40" : "border-slate-200 bg-white",
                disabled ? "opacity-60" : "",
            ].join(" ")}
            role="group"
            aria-label={ariaLabel}
        >
            {/* O page.tsx continua lendo o mesmo valor pelo mesmo ID. */}
            <input id={inputId} type="hidden" value={value} readOnly />

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {options.map((option) => {
                    const checked = value === option.value;

                    return (
                        <label
                            key={option.value}
                            className={[
                                "inline-flex cursor-pointer items-center gap-2 text-sm font-medium",
                                checked ? "text-blue-700" : "text-slate-700",
                                disabled ? "cursor-not-allowed" : "",
                            ].join(" ")}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => onChange(option.value)}
                                className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                                aria-label={`${ariaLabel}: ${option.label}`}
                            />
                            <span>{option.label}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

const SIM_NAO_OPTIONS: readonly CheckboxChoiceOption[] = [
    { value: "Sim", label: "Sim" },
    { value: "Não", label: "Não" },
];

const ORNAMENTACAO_TIPO_OPTIONS: readonly CheckboxChoiceOption[] = [
    { value: "Natural", label: "Natural" },
    { value: "Artificial", label: "Artificial" },
];


/* =========================================================================
   Combobox genérico (estoque)
   - action: "urnas_buscar" | "roupas_buscar" | "invols_buscar" | "veus_buscar" | "cordoes_buscar"
   - Usa deposito_nome e somente_com_saldo=1
   - ✅ abre o modal já carregando a lista do depósito, sem precisar digitar
   - ✅ cache por depósito/action (evita modal “branco”)
   - ✅ iOS scroll smoothing e eventos pointer
   ========================================================================= */

type CacheKey = string;
type CacheEntry = {
    rows: EstoqueRow[];
    ts: number;
};
const CACHE_TTL_MS = 60_000; // 1 min (ajuda evitar “piscar branco” sem ficar desatualizado)

function EstoqueCombobox({
    inputId,
    label,
    required,
    placeholder,
    initialValue,
    disabled,

    depositoLabel,
    depositoOptions,
    depositoValue,
    onChangeDeposito,

    action,
    errorText,
    onBlurValidate,

    onSelectRow,
    onTypingInvalidate,

    footerHint,
    extraButtons,
}: {
    inputId: string;
    label: string;
    required: boolean;
    placeholder?: string;
    initialValue: string;
    disabled?: boolean;

    depositoLabel: string;
    depositoOptions: Array<{ value: string; label: string }>;
    depositoValue: string;
    onChangeDeposito: (v: string) => void;

    action: string;
    errorText?: string;
    onBlurValidate?: () => void;

    onSelectRow: (row: EstoqueRow) => void;
    onTypingInvalidate?: (typed: string) => void;

    footerHint?: React.ReactNode;
    extraButtons?: React.ReactNode;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const [pickerOpen, setPickerOpen] = useState(false);

    // valor exibido no campo principal (e que o salvarGrupoWizard lê pelo DOM)
    const [value, setValue] = useState(initialValue || "");

    // busca dentro do modal (opcional)
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const lastInitSigRef = useRef<string>("");

    // cache local (por componente) p/ evitar “tela branca” quando já carregou antes
    const cacheRef = useRef<Record<CacheKey, CacheEntry>>({});

    const cacheKey: CacheKey = `${action}||${String(depositoValue || "").trim()}`;

    // sincroniza quando abrir/editar registro
    useEffect(() => {
        const sig = `${String(initialValue || "")}||${String(depositoValue || "")}`;
        if (lastInitSigRef.current === sig) return;
        lastInitSigRef.current = sig;
        setValue(initialValue || "");
    }, [initialValue, depositoValue]);

    // ✅ ao abrir modal: limpa erro, e tenta popular rows via cache instantâneo
    useEffect(() => {
        if (!pickerOpen) return;

        setErr("");

        // sempre limpa o filtro ao abrir para vir “lista do depósito”
        setQ("");

        // usa cache se existir e estiver recente
        const cached = cacheRef.current[cacheKey];
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            setRows(cached.rows || []);
            setLoading(false);
        } else {
            // não zera rows agressivamente se já tinha algo (evita “branco” em re-open),
            // mas se não tiver cache, mantém o que estiver e mostra loading ao buscar
            // (o fetch vai atualizar)
        }

        // 🔥 não focar teclado automaticamente (evita bugs/reflow no celular)
        // requestAnimationFrame(() => searchRef.current?.focus());
    }, [pickerOpen, cacheKey]);

    // ✅ busca async (dentro do modal) — busca mesmo com q vazio
    useEffect(() => {
        if (!pickerOpen) return;

        const qq = q.trim();

        // debounce pequeno
        const ac = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            setErr("");

            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", action);
                url.searchParams.set("q", qq); // pode ser vazio
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "60");
                url.searchParams.set("deposito_nome", String(depositoValue || ""));

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                // se sessão cair, isso aqui ajuda a diagnosticar
                const j = await r.json().catch(() => null);
                if (!j?.ok) {
                    const httpInfo = r?.status ? ` (HTTP ${r.status})` : "";
                    throw new Error((j?.msg || "Falha ao buscar itens no estoque") + httpInfo);
                }

                const nextRows = (j.rows || []) as EstoqueRow[];

                setRows(nextRows);
                // cacheia somente quando q está vazio (lista “base” do depósito)
                if (!qq) {
                    cacheRef.current[cacheKey] = { rows: nextRows, ts: Date.now() };
                }
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setErr(e?.message || "Erro na busca");
                setRows([]);
            } finally {
                setLoading(false);
            }
        }, 150);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [q, pickerOpen, action, depositoValue, cacheKey]);

    const applySelection = (it: EstoqueRow) => {
        const pid = getPidFromRow(it);
        if (!pid || pid <= 0) {
            setErr("Este item veio sem produto_id. Contate o suporte.");
            onBlurValidate?.();
            return;
        }

        const nome = String(it.nome || "").trim();

        // atualiza valor do campo principal (DOM lê isso)
        setValue(nome);
        setErr("");
        setPickerOpen(false);

        // informa o wizardData (meta: produto_id, cb, depósito etc)
        onSelectRow(it);

        // blur leve para evitar teclado/scroll bugs em mobile
        requestAnimationFrame(() => {
            try {
                searchRef.current?.blur();
                inputRef.current?.blur();
            } catch {
                // noop
            }
        });
    };

    const limparSelecao = () => {
        setValue("");
        setQ("");
        setRows([]);
        setErr("");
        onTypingInvalidate?.("");
        onBlurValidate?.();
    };

    return (
        <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr] sm:gap-2">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">{depositoLabel}</label>

                    <select
                        className="w-full rounded-md border px-2 py-2 text-base disabled:opacity-60"
                        value={depositoValue}
                        onChange={(e) => {
                            onChangeDeposito(e.target.value);

                            // não zera rows agressivamente aqui (evita “modal branco”)
                            setErr("");

                            // ✅ ao trocar depósito, já abre o modal
                            setPickerOpen(true);

                            onBlurValidate?.();
                        }}
                        disabled={disabled}
                        title={depositoLabel}
                    >
                        {depositoOptions.map((op) => (
                            <option key={op.value} value={op.value}>
                                {op.label}
                            </option>
                        ))}
                    </select>

                    {extraButtons ? <div className="mt-2 flex flex-wrap gap-2">{extraButtons}</div> : null}
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                        {label} {required && <span className="text-red-600">*</span>}
                    </label>

                    <div className="flex gap-2">
                        {/* mantém id pro salvarGrupoWizard */}
                        <input
                            id={inputId}
                            ref={inputRef}
                            type="text"
                            placeholder={placeholder || "Clique em Selecionar..."}
                            value={value}
                            readOnly
                            onClick={() => {
                                if (!disabled) setPickerOpen(true);
                            }}
                            className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${errorText ? "border-red-500" : ""
                                }`}
                            disabled={disabled}
                            autoComplete="off"
                            title={label}
                        />

                        <button
                            type="button"
                            className="shrink-0 rounded-md border px-3 py-2 text-base hover:bg-muted disabled:opacity-60"
                            disabled={disabled}
                            onClick={() => setPickerOpen(true)}
                        >
                            Selecionar
                        </button>
                    </div>

                    {errorText ? <div className="mt-1 text-xs text-red-600">{errorText}</div> : null}

                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                            disabled={disabled}
                            onClick={limparSelecao}
                        >
                            Limpar
                        </button>
                    </div>
                </div>
            </div>



            {footerHint ? <div className="mt-1 text-[11px] text-slate-400">{footerHint}</div> : null}

            {/* MODAL / POPUP */}
            <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} ariaLabel={`Selecionar ${label}`} maxWidth={720}>
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold">Selecionar {label}</h3>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Depósito: <b>{depositoValue}</b>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-base hover:bg-muted"
                        onClick={() => setPickerOpen(false)}
                    >
                        Fechar
                    </button>
                </div>

                {/* ✅ busca opcional */}
                <div className="mt-4 flex gap-2">
                    <input
                        ref={searchRef}
                        type="text"
                        value={q}
                        onChange={(e) => {
                            const v = e.target.value;
                            setQ(v);
                            setErr("");
                            // NÃO mexe na seleção
                        }}
                        placeholder="(Opcional) filtrar por nome ou código…"
                        className="w-full rounded-md border px-3 py-2 text-base"
                        autoComplete="off"
                    />

                    <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-base hover:bg-muted"
                        onClick={() => setQ("")}
                        title="Limpar filtro"
                    >
                        Limpar filtro
                    </button>
                </div>

                <div className="mt-3 rounded-xl border bg-white">
                    {loading ? (
                        <div className="p-3 text-base text-slate-600">Carregando itens do depósito…</div>
                    ) : err ? (
                        <div className="p-3 text-sm text-red-600">{err}</div>
                    ) : rows.length === 0 ? (
                        <div className="p-3 text-base text-slate-600">Nenhum item encontrado no estoque ({depositoValue}).</div>
                    ) : (
                        <ul
                            className="max-h-[65vh] overflow-auto py-1"
                            style={{ WebkitOverflowScrolling: "touch" }} // ✅ iOS smoother scroll
                        >
                            {rows.map((it) => {
                                const k = getStableRowKey(it);
                                return (
                                    <li key={k}>
                                        <button
                                            type="button"
                                            className="w-full px-3 py-3 text-left text-base hover:bg-slate-50"
                                            onClick={() => applySelection(it)}
                                            onPointerUp={() => applySelection(it)} // ✅ melhora toque no iOS dentro de overflow
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium text-slate-900">{it.nome}</span>
                                                <span className="shrink-0 text-xs text-slate-600">
                                                    estoque: <b>{Number(it.saldo_total) || 0}</b>
                                                </span>
                                            </div>
                                            <div className="mt-0.5 truncate text-xs text-slate-600">
                                                CB: <b>{(it as any).codigo_barras || ""}</b>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="mt-3 text-[11px] text-slate-500">Toque no item para selecionar. (Sem digitar, a lista já vem do depósito.)</div>
            </Modal>
        </div>
    );
}

/* -------------------- depósitos -------------------- */
type DepUrna = "MEMORIAL" | "FUNERARIA";
type DepRoupa = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA";
type DepInvol = "ARMARIO SANDRO" | "ARMARIO ILDO";

// ✅ VÉU e CORDÃO saem só destes 3
type DepVeu = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA";
type DepCordao = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA";

function normalizeDepUrna(v: any): DepUrna {
    const s = normUpper(v);
    return s === "FUNERARIA" ? "FUNERARIA" : "MEMORIAL";
}

function normalizeDepRoupa(v: any): DepRoupa {
    const s = normUpper(v);
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return "ARMARIO SANDRO";
}

function normalizeDepInvol(v: any): DepInvol {
    const s = normUpper(v);
    return s === "ARMARIO ILDO" ? "ARMARIO ILDO" : "ARMARIO SANDRO";
}

function normalizeDepVeu(v: any): DepVeu {
    const s = normUpper(v);
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return "ARMARIO SANDRO";
}

function normalizeDepCordao(v: any): DepCordao {
    const s = normUpper(v);
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return "ARMARIO SANDRO";
}

/* =========================================================================
   Wizard
   ========================================================================= */
export default function Wizard({
    open,
    onClose,
    wizardTitle,
    wizardStep,
    setWizardStep,
    wizardRestrictGroup,
    wizardData,
    setWizardData,
    obrigatorios,
    steps,
    wizardStepIndexes,
    wizardStepTitles,

    assistenciaVal,
    setAssistenciaVal,
    tanatoVal,
    setTanatoVal,

    materiaisSelecionadosResumo,
    arrumacaoSelecionadaResumo,
    setMateriaisOpen,
    setArrumacaoOpen,

    salvarGrupoWizard,
    concluirWizard,

    wizardSubmitting,
}: {
    open: boolean;
    onClose: () => void;
    wizardTitle: string;
    wizardStep: number;
    setWizardStep: (n: number) => void;
    wizardRestrictGroup: number | null;
    wizardData: Registro;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
    obrigatorios: string[];
    steps: readonly Step[];
    wizardStepIndexes: number[][];
    wizardStepTitles: string[];

    assistenciaVal: string;
    setAssistenciaVal: (v: string) => void;
    tanatoVal: string;
    setTanatoVal: (v: string) => void;

    materiaisSelecionadosResumo: string;
    arrumacaoSelecionadaResumo: string;
    setMateriaisOpen: (b: boolean) => void;
    setArrumacaoOpen: (b: boolean) => void;

    salvarGrupoWizard: () => Registro | null;
    concluirWizard: () => Promise<void>;

    wizardSubmitting: boolean;
}) {
    const [ornamentacaoVal, setOrnamentacaoVal] = useState<string>("");
    const [involVal, setInvolVal] = useState<string>("");
    const [veuVal, setVeuVal] = useState<string>("");
    const [cordaoVal, setCordaoVal] = useState<string>("");

    // Controle exclusivamente visual para mostrar ou esconder os seletores.
    // Os dados continuam sendo gravados nos campos atuais de urna e roupa.
    const [urnaUsoVal, setUrnaUsoVal] = useState<string>("");
    const [roupaUsoVal, setRoupaUsoVal] = useState<string>("");

    // ✅ Velório: sala + velório online (condicional)
    const [salaVelorioVal, setSalaVelorioVal] = useState<string>("");
    const [velorioOnlineVal, setVelorioOnlineVal] = useState<string>("");

    const [assistenciaErro, setAssistenciaErro] = useState<string>("");
    const [urnaUsoErro, setUrnaUsoErro] = useState<string>("");
    const [roupaUsoErro, setRoupaUsoErro] = useState<string>("");
    const [urnaErro, setUrnaErro] = useState<string>("");
    const [roupaErro, setRoupaErro] = useState<string>("");
    const [involErro, setInvolErro] = useState<string>("");
    const [veuErro, setVeuErro] = useState<string>("");
    const [cordaoErro, setCordaoErro] = useState<string>("");

    // ✅ erros de "Sim/Não" (select obrigatório)
    const [tanatoSelectErro, setTanatoSelectErro] = useState<string>("");
    const [ornamentacaoSelectErro, setOrnamentacaoSelectErro] = useState<string>("");
    const [involSelectErro, setInvolSelectErro] = useState<string>("");
    const [veuSelectErro, setVeuSelectErro] = useState<string>("");
    const [cordaoSelectErro, setCordaoSelectErro] = useState<string>("");
    const [velorioOnlineErro, setVelorioOnlineErro] = useState<string>("");

    // ✅ erro do tipo (Natural/Artificial) quando ornamentacao = Sim
    const [ornamentacaoTipoErro, setOrnamentacaoTipoErro] = useState<string>("");

    // depósitos locais (controlados)
    const [depUrna, setDepUrna] = useState<DepUrna>("MEMORIAL");
    const [depRoupa, setDepRoupa] = useState<DepRoupa>("ARMARIO SANDRO");
    const [depInvol, setDepInvol] = useState<DepInvol>("ARMARIO SANDRO");
    const [depVeu, setDepVeu] = useState<DepVeu>("ARMARIO SANDRO");
    const [depCordao, setDepCordao] = useState<DepCordao>("ARMARIO SANDRO");

    useEffect(() => {
        if (!open) return;

        const registroExistente = (wizardData as any).id != null;

        const temUrna =
            Number((wizardData as any).urna_produto_id ?? 0) > 0 ||
            String((wizardData as any).urna ?? "").trim() !== "";

        const temRoupa =
            Number((wizardData as any).roupa_produto_id ?? 0) > 0 ||
            String((wizardData as any).roupa ?? "").trim() !== "";

        setUrnaUsoVal(temUrna ? "Sim" : registroExistente ? "Não" : "");
        setRoupaUsoVal(temRoupa ? "Sim" : registroExistente ? "Não" : "");
    }, [open, (wizardData as any).id]);

    useEffect(() => {
        setOrnamentacaoVal(String((wizardData as any).ornamentacao ?? ""));
        setInvolVal(String((wizardData as any).invol ?? ""));
        setVeuVal(String((wizardData as any).veu ?? ""));
        setCordaoVal(String((wizardData as any).cordao ?? ""));
        setSalaVelorioVal(String((wizardData as any).sala_velorio ?? ""));
        setVelorioOnlineVal(String((wizardData as any).velorio_online ?? ""));
    }, [
        open,
        (wizardData as any).ornamentacao,
        (wizardData as any).invol,
        (wizardData as any).veu,
        (wizardData as any).cordao,
        (wizardData as any).sala_velorio,
        (wizardData as any).velorio_online,
    ]);

    useEffect(() => {
        if (!open) return;

        setUrnaUsoErro("");
        setRoupaUsoErro("");
        setUrnaErro("");
        setRoupaErro("");
        setInvolErro("");
        setVeuErro("");
        setCordaoErro("");
        setAssistenciaErro("");

        // ✅ limpa erros dos selects Sim/Não
        setTanatoSelectErro("");
        setOrnamentacaoSelectErro("");
        setInvolSelectErro("");
        setVeuSelectErro("");
        setCordaoSelectErro("");
        setVelorioOnlineErro("");

        // ✅ limpa erro do Natural/Artificial
        setOrnamentacaoTipoErro("");

        setDepUrna(normalizeDepUrna((wizardData as any).urna_deposito_nome ?? "MEMORIAL"));
        setDepRoupa(normalizeDepRoupa((wizardData as any).roupa_deposito_nome ?? "ARMARIO SANDRO"));
        setDepInvol(normalizeDepInvol((wizardData as any).invol_deposito_nome ?? "ARMARIO SANDRO"));
        setDepVeu(normalizeDepVeu((wizardData as any).veu_deposito_nome ?? "ARMARIO SANDRO"));
        setDepCordao(normalizeDepCordao((wizardData as any).cordao_deposito_nome ?? "ARMARIO SANDRO"));
    }, [open]);

    // ✅ auto-limpa erro quando produto_id chega
    useEffect(() => {
        const urnaPid = Number((wizardData as any).urna_produto_id ?? 0) || 0;
        if (urnaPid > 0) setUrnaErro("");
    }, [(wizardData as any).urna_produto_id]);

    useEffect(() => {
        const involPid = Number((wizardData as any).invol_produto_id ?? 0) || 0;
        if (involPid > 0) setInvolErro("");
    }, [(wizardData as any).invol_produto_id]);

    useEffect(() => {
        const pid = Number((wizardData as any).veu_produto_id ?? 0) || 0;
        if (pid > 0) setVeuErro("");
    }, [(wizardData as any).veu_produto_id]);

    useEffect(() => {
        const pid = Number((wizardData as any).cordao_produto_id ?? 0) || 0;
        if (pid > 0) setCordaoErro("");
    }, [(wizardData as any).cordao_produto_id]);

    // ✅ limpa erro URNA quando seleção chega no wizardData
    useEffect(() => {
        if (!open) return;

        const urnaTxt = String((wizardData as any).urna ?? "").trim();
        const pid = Number((wizardData as any).urna_produto_id ?? 0) || 0;

        if (pid > 0 || urnaTxt === "") setUrnaErro("");
    }, [open, (wizardData as any).urna, (wizardData as any).urna_produto_id]);

    // ✅ limpa erro INVOL quando invol != Sim, ou quando produto/depósito chegam
    useEffect(() => {
        if (!open) return;

        const invol = String((wizardData as any).invol ?? involVal ?? "");
        if (invol !== "Sim") {
            setInvolErro("");
            return;
        }

        const pid = Number((wizardData as any).invol_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).invol_deposito_nome ?? "").trim();

        if (pid > 0 && dep) setInvolErro("");
    }, [open, involVal, (wizardData as any).invol, (wizardData as any).invol_produto_id, (wizardData as any).invol_deposito_nome]);

    useEffect(() => {
        if (!open) return;

        const veu = String((wizardData as any).veu ?? veuVal ?? "");
        if (veu !== "Sim") {
            setVeuErro("");
            return;
        }

        const pid = Number((wizardData as any).veu_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).veu_deposito_nome ?? "").trim();
        if (pid > 0 && dep) setVeuErro("");
    }, [open, veuVal, (wizardData as any).veu, (wizardData as any).veu_produto_id, (wizardData as any).veu_deposito_nome]);

    useEffect(() => {
        if (!open) return;

        const cordao = String((wizardData as any).cordao ?? cordaoVal ?? "");
        if (cordao !== "Sim") {
            setCordaoErro("");
            return;
        }

        const pid = Number((wizardData as any).cordao_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).cordao_deposito_nome ?? "").trim();
        if (pid > 0 && dep) setCordaoErro("");
    }, [open, cordaoVal, (wizardData as any).cordao, (wizardData as any).cordao_produto_id, (wizardData as any).cordao_deposito_nome]);

    const isRequired = (id: string) => obrigatorios.includes(id);

    // Quando o page.tsx mandar obrigatorios = [], nenhuma regra especial deve bloquear.
    // Quando fase02 em diante ativar obrigatorios, as regras especiais voltam a valer.
    const obrigatoriedadeAtiva = obrigatorios.length > 0;

    const assistenciaGroupIndex = useMemo(() => {
        return wizardStepIndexes.findIndex((arr) => arr.some((idx) => steps[idx]?.id === "assistencia"));
    }, [wizardStepIndexes, steps]);

    const isRestrito = typeof wizardRestrictGroup === "number";

    const requireAssistencia = useMemo(() => {
        if (!obrigatorios.includes("assistencia")) return false;
        if (assistenciaGroupIndex < 0) return false;
        if (!isRestrito) return true;
        return wizardRestrictGroup === assistenciaGroupIndex;
    }, [assistenciaGroupIndex, isRestrito, wizardRestrictGroup, obrigatorios]);

    const grupoIndices = wizardStepIndexes[wizardStep] || [];
    const grupoSteps = useMemo(() => grupoIndices.map((i) => steps[i]), [grupoIndices, steps]);

    const assistenciaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "assistencia"), [grupoSteps]);
    const urnaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "urna"), [grupoSteps]);
    const roupaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "roupa"), [grupoSteps]);
    const involNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol"), [grupoSteps]);
    const involItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol_item"), [grupoSteps]);
    const veuNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu"), [grupoSteps]);
    const veuItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu_item"), [grupoSteps]);
    const cordaoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao"), [grupoSteps]);
    const cordaoItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao_item"), [grupoSteps]);
    const tanatoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "tanato"), [grupoSteps]);
    const ornamentacaoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "ornamentacao"), [grupoSteps]);
    const involSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol"), [grupoSteps]);
    const veuSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu"), [grupoSteps]);
    const cordaoSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao"), [grupoSteps]);
    const velorioOnlineNoGrupoAtual = useMemo(
        () => grupoSteps.some((s) => s.id === "local_velorio" || s.id === "sala_velorio" || s.id === "velorio_online"),
        [grupoSteps]
    );

    const validarAssistencia = () => {
        if (!requireAssistencia) return true;
        if (isSimNao(assistenciaVal)) {
            setAssistenciaErro("");
            return true;
        }
        setAssistenciaErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const bloqueiaPorAssistencia = requireAssistencia && assistenciaNoGrupoAtual && !isSimNao(assistenciaVal);

    // ✅ validações "Sim/Não" para selects obrigatórios
    const validarTanatoSelect = () => {
        if (!tanatoNoGrupoAtual) return true;
        if (!isRequired("tanato")) return true;

        if (isSimNao(tanatoVal)) {
            setTanatoSelectErro("");
            return true;
        }
        setTanatoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarOrnamentacaoSelect = () => {
        if (!ornamentacaoNoGrupoAtual) return true;
        if (!isRequired("ornamentacao")) return true;

        if (isSimNao(ornamentacaoVal)) {
            setOrnamentacaoSelectErro("");
            return true;
        }
        setOrnamentacaoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarInvolSelect = () => {
        if (!involSelectNoGrupoAtual) return true;
        if (!isRequired("invol")) return true;

        if (isSimNao(involVal)) {
            setInvolSelectErro("");
            return true;
        }
        setInvolSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarVeuSelect = () => {
        if (!veuSelectNoGrupoAtual) return true;
        if (!isRequired("veu")) return true;

        if (isSimNao(veuVal)) {
            setVeuSelectErro("");
            return true;
        }
        setVeuSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarCordaoSelect = () => {
        if (!cordaoSelectNoGrupoAtual) return true;
        if (!isRequired("cordao")) return true;

        if (isSimNao(cordaoVal)) {
            setCordaoSelectErro("");
            return true;
        }
        setCordaoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    // ✅ Velório Online é obrigatório somente quando uma sala for marcada.
    const validarVelorioOnlineSeNecessario = () => {
        if (!velorioOnlineNoGrupoAtual) return true;

        // Antes de Corpo na Clínica, o page.tsx envia obrigatorios = [].
        // Nesse cenário, Velório Online não deve bloquear, mesmo se sala estiver marcada.
        if (!obrigatoriedadeAtiva) {
            setVelorioOnlineErro("");
            return true;
        }

        const sala = String(salaVelorioVal || (wizardData as any).sala_velorio || "").trim();
        if (!sala) {
            setVelorioOnlineErro("");
            return true;
        }

        const online = String(velorioOnlineVal || (wizardData as any).velorio_online || "").trim();
        if (online === "Sim" || online === "Não") {
            setVelorioOnlineErro("");
            return true;
        }

        setVelorioOnlineErro('Selecione "Sim" ou "Não" em Velório Online.');
        return false;
    };

    // ✅ se ornamentacao = Sim, exige Natural/Artificial
    const validarOrnamentacaoTipoSeNecessario = () => {
        const tipoNoGrupoAtual = grupoSteps.some((s) => s.id === "ornamentacao_tipo");
        if (!tipoNoGrupoAtual) return true;

        // Só exige Natural/Artificial quando a obrigatoriedade de Ornamentação estiver ativa.
        if (!isRequired("ornamentacao")) {
            setOrnamentacaoTipoErro("");
            return true;
        }

        if (ornamentacaoVal !== "Sim") {
            setOrnamentacaoTipoErro("");
            return true;
        }

        const tipo = String((wizardData as any).ornamentacao_tipo ?? "").trim();
        if (!tipo) {
            setOrnamentacaoTipoErro('Selecione "Natural" ou "Artificial".');
            return false;
        }

        setOrnamentacaoTipoErro("");
        return true;
    };


    // ✅ valida URNA: a escolha visual Sim/Não é obrigatória quando as validações do Wizard estão ativas.
    const validarUrnaSeNecessario = () => {
        if (!urnaNoGrupoAtual) return true;

        if (!obrigatoriedadeAtiva) {
            setUrnaUsoErro("");
            setUrnaErro("");
            return true;
        }

        if (!isSimNao(urnaUsoVal)) {
            setUrnaUsoErro('Marque "Sim" ou "Não" em Urna.');
            setUrnaErro("");
            return false;
        }

        setUrnaUsoErro("");

        if (urnaUsoVal === "Não") {
            setUrnaErro("");
            return true;
        }

        const urnaTxt = String((wizardData as any).urna ?? "").trim();
        const pid = Number((wizardData as any).urna_produto_id ?? 0) || 0;

        if (!urnaTxt || pid <= 0) {
            setUrnaErro("Selecione uma urna da lista (produto do estoque).");
            return false;
        }

        setUrnaErro("");
        return true;
    };

    // ✅ valida ROUPA: a escolha visual Sim/Não é obrigatória quando as validações do Wizard estão ativas.
    const validarRoupaSeNecessario = () => {
        if (!roupaNoGrupoAtual) return true;

        if (!obrigatoriedadeAtiva) {
            setRoupaUsoErro("");
            setRoupaErro("");
            return true;
        }

        if (!isSimNao(roupaUsoVal)) {
            setRoupaUsoErro('Marque "Sim" ou "Não" em Roupa.');
            setRoupaErro("");
            return false;
        }

        setRoupaUsoErro("");

        if (roupaUsoVal === "Não") {
            setRoupaErro("");
            return true;
        }

        const roupaTxt = String((wizardData as any).roupa ?? "").trim();

        if (!roupaTxt) {
            setRoupaErro('Selecione uma roupa da lista (estoque) ou use "ROUPA PRÓPRIA".');
            return false;
        }

        if (isRoupaPropria(roupaTxt)) {
            setRoupaErro("");
            return true;
        }

        const pid = Number((wizardData as any).roupa_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).roupa_deposito_nome ?? "").trim();

        if (pid <= 0) {
            setRoupaErro('Selecione uma roupa da lista (estoque) ou use "ROUPA PRÓPRIA".');
            return false;
        }

        if (!dep) {
            setRoupaErro("Selecione o local de saída da roupa.");
            return false;
        }

        setRoupaErro("");
        return true;
    };

    // ✅ valida INVOL somente quando a obrigatoriedade de INVOL estiver ativa e invol = Sim
    const validarInvolSeNecessario = () => {
        if (!involNoGrupoAtual && !involItemNoGrupoAtual) return true;

        if (!isRequired("invol")) {
            setInvolErro("");
            return true;
        }

        const invol = String((wizardData as any).invol ?? involVal ?? "");
        if (invol !== "Sim") {
            setInvolErro("");
            return true;
        }

        const pid = Number((wizardData as any).invol_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).invol_deposito_nome ?? "").trim();

        if (pid <= 0) {
            setInvolErro("Selecione um INVOL da lista (produto do estoque).");
            return false;
        }

        if (!dep) {
            setInvolErro("Selecione o local do INVOL (ARMARIO SANDRO ou ARMARIO ILDO).");
            return false;
        }

        setInvolErro("");
        return true;
    };

    // ✅ valida VÉU somente quando a obrigatoriedade de VÉU estiver ativa e veu = Sim
    const validarVeuSeNecessario = () => {
        if (!veuNoGrupoAtual && !veuItemNoGrupoAtual) return true;

        if (!isRequired("veu")) {
            setVeuErro("");
            return true;
        }

        const veu = String((wizardData as any).veu ?? veuVal ?? "");
        if (veu !== "Sim") {
            setVeuErro("");
            return true;
        }

        const pid = Number((wizardData as any).veu_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).veu_deposito_nome ?? "").trim();

        if (pid <= 0) {
            setVeuErro("Selecione um VÉU da lista (produto do estoque).");
            return false;
        }

        if (!dep) {
            setVeuErro("Selecione o local do VÉU (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).");
            return false;
        }

        setVeuErro("");
        return true;
    };

    // ✅ valida CORDÃO somente quando a obrigatoriedade de CORDÃO estiver ativa e cordao = Sim
    const validarCordaoSeNecessario = () => {
        if (!cordaoNoGrupoAtual && !cordaoItemNoGrupoAtual) return true;

        if (!isRequired("cordao")) {
            setCordaoErro("");
            return true;
        }

        const cordao = String((wizardData as any).cordao ?? cordaoVal ?? "");
        if (cordao !== "Sim") {
            setCordaoErro("");
            return true;
        }

        const pid = Number((wizardData as any).cordao_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).cordao_deposito_nome ?? "").trim();

        if (pid <= 0) {
            setCordaoErro("Selecione um CORDÃO da lista (produto do estoque).");
            return false;
        }

        if (!dep) {
            setCordaoErro("Selecione o local do CORDÃO (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).");
            return false;
        }

        setCordaoErro("");
        return true;
    };

    // GPS p/ Local do Velório
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMsg, setGpsMsg] = useState<string | null>(null);
    const localVelorioRef = useRef<HTMLInputElement>(null);

    async function preencherLocalVelorioComGPS() {
        setGpsMsg(null);

        if (typeof window === "undefined") return;
        if (!("geolocation" in navigator)) {
            setGpsMsg("Este dispositivo/navegador não suporta GPS (geolocalização).");
            return;
        }

        setGpsLoading(true);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

                const el = localVelorioRef.current;
                if (el) el.value = url;

                setGpsMsg("Localização capturada e link gerado!");
                setGpsLoading(false);
            },
            (err) => {
                let msg = "Não foi possível obter a localização.";
                if ((err as any)?.code === 1) msg = "Permissão de localização negada.";
                if ((err as any)?.code === 2) msg = "Localização indisponível no momento (GPS sem sinal).";
                if ((err as any)?.code === 3) msg = "Tempo esgotado ao tentar obter localização.";
                setGpsMsg(msg);
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    const isLastStep = wizardStep === wizardStepIndexes.length - 1;

    const goPrev = () => {
        if (wizardSubmitting) return;
        setWizardStep(Math.max(0, wizardStep - 1));
    };

    const scrollToFirstError = () => {
        const el =
            (document.querySelector('[data-wizard-error="1"]') as HTMLElement | null) ||
            (document.querySelector(".border-red-500") as HTMLElement | null);

        if (!el) return;

        // ✅ no mobile: evita smooth (reduz bug “tela branca”/repaint)
        const mobile = isMobileCoarsePointer();
        el.scrollIntoView({ behavior: mobile ? "auto" : "smooth", block: "center" });

        // ✅ no mobile: não força focus (teclado/reflow)
        if (!mobile) {
            requestAnimationFrame(() => {
                (el as any)?.focus?.();
            });
        }
    };

    const goNext = () => {
        if (wizardSubmitting) return;

        if (assistenciaNoGrupoAtual && !validarAssistencia()) {
            scrollToFirstError();
            return;
        }

        if (!validarTanatoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarOrnamentacaoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarOrnamentacaoTipoSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarInvolSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarVeuSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarCordaoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarVelorioOnlineSeNecessario()) {
            scrollToFirstError();
            return;
        }

        if (!validarUrnaSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarRoupaSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarVeuSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarCordaoSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarInvolSeNecessario()) {
            scrollToFirstError();
            return;
        }

        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };

    const tentarConcluir = async () => {
        if (wizardSubmitting) return;

        if (assistenciaNoGrupoAtual && !validarAssistencia()) {
            scrollToFirstError();
            return;
        }

        if (!validarTanatoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarOrnamentacaoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarOrnamentacaoTipoSeNecessario()) {
            scrollToFirstError();
            return;
        }

        if (!validarInvolSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarVeuSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarCordaoSelect()) {
            scrollToFirstError();
            return;
        }
        if (!validarVelorioOnlineSeNecessario()) {
            scrollToFirstError();
            return;
        }

        if (!validarUrnaSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarRoupaSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarVeuSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarCordaoSeNecessario()) {
            scrollToFirstError();
            return;
        }
        if (!validarInvolSeNecessario()) {
            scrollToFirstError();
            return;
        }

        try {
            await concluirWizard();
        } catch (e: any) {
            console.error("Falha ao concluir wizard:", e);
            alert(e?.message || "Erro ao salvar. Veja o console/Network.");
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Wizard" maxWidth={740}>
            <div className="flex items-center gap-2" data-wizard-ui="checkbox-itens-v2">
                <h2 className="text-xl font-semibold">{wizardTitle}</h2>
                {wizardSubmitting && (
                    <span
                        className="ml-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        aria-live="polite"
                    >
                        <svg className="h-3 w-3 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Salvando…
                    </span>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {wizardStepTitles.map((t, i) => (
                    <span
                        key={t}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${i === wizardStep ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                            }`}
                    >
                        {t}
                    </span>
                ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {grupoSteps.map((step) => {
                    if (step.id === "ornamentacao_tipo" && ornamentacaoVal !== "Sim") return null;
                    if (step.id === "arrumacao" && tanatoVal !== "Sim") return null;

                    /* ===========================
                       URNA (checkbox Sim/Não + seletor async)
                       =========================== */
                    if (step.type === "async_urna" && step.id === "urna") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    Urna
                                    {obrigatoriedadeAtiva && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId="wizard-urna-uso"
                                    ariaLabel="Urna"
                                    value={urnaUsoVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!urnaUsoErro}
                                    onChange={(v) => {
                                        setUrnaUsoVal(v);
                                        setUrnaUsoErro("");

                                        if (v === "Não") {
                                            setWizardData((prev: any) => ({
                                                ...prev,
                                                urna: "",
                                                urna_deposito_nome: "",
                                                urna_produto_id: 0,
                                                urna_codigo_barras: "",
                                            }));
                                            setUrnaErro("");
                                            return;
                                        }

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            urna_deposito_nome:
                                                String(prev?.urna_deposito_nome ?? "").trim() || depUrna,
                                        }));
                                    }}
                                />

                                {urnaUsoErro && <div className="mt-1 text-xs text-red-600">{urnaUsoErro}</div>}

                                {urnaUsoVal === "Sim" && (
                                    <div className="mt-3">
                                        <EstoqueCombobox
                                            inputId="wizard-urna"
                                            label="Urna para selecionar"
                                            required={obrigatoriedadeAtiva}
                                            placeholder={step.placeholder || "Selecione no estoque…"}
                                            initialValue={String((wizardData as any).urna ?? "")}
                                            disabled={wizardSubmitting}
                                            depositoLabel="Local da Urna"
                                            depositoOptions={[
                                                { value: "MEMORIAL", label: "MEMORIAL" },
                                                { value: "FUNERARIA", label: "FUNERARIA" },
                                            ]}
                                            depositoValue={depUrna}
                                            onChangeDeposito={(v) => {
                                                const next = normalizeDepUrna(v);
                                                setDepUrna(next);

                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    urna: "",
                                                    urna_deposito_nome: next,
                                                    urna_produto_id: 0,
                                                    urna_codigo_barras: "",
                                                }));

                                                validarUrnaSeNecessario();
                                            }}
                                            action="urnas_buscar"
                                            errorText={urnaErro}
                                            onBlurValidate={validarUrnaSeNecessario}
                                            onTypingInvalidate={(typed) => {
                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    urna: typed,
                                                    urna_deposito_nome: depUrna,
                                                    urna_produto_id: 0,
                                                    urna_codigo_barras: "",
                                                }));
                                            }}
                                            onSelectRow={(it) => {
                                                const pid = getPidFromRow(it);
                                                const cb = String((it as any).codigo_barras || "").trim();

                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    urna: String(it.nome || "").trim(),
                                                    urna_deposito_nome: depUrna,
                                                    urna_produto_id: pid,
                                                    urna_codigo_barras: cb,
                                                }));

                                                setUrnaErro("");
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       ROUPA (checkbox Sim/Não + seletor async)
                       =========================== */
                    if (step.type === "async_roupa" && step.id === "roupa") {
                        const roupaAtual = String((wizardData as any).roupa ?? "");
                        const isPropria = isRoupaPropria(roupaAtual);

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    Roupa
                                    {obrigatoriedadeAtiva && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId="wizard-roupa-uso"
                                    ariaLabel="Roupa"
                                    value={roupaUsoVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!roupaUsoErro}
                                    onChange={(v) => {
                                        setRoupaUsoVal(v);
                                        setRoupaUsoErro("");

                                        if (v === "Não") {
                                            setWizardData((prev: any) => ({
                                                ...prev,
                                                roupa: "",
                                                roupa_deposito_nome: "",
                                                roupa_produto_id: 0,
                                                roupa_codigo_barras: "",
                                                roupa_propria: 0,
                                            }));
                                            setRoupaErro("");
                                            return;
                                        }

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            roupa_deposito_nome:
                                                isRoupaPropria(prev?.roupa)
                                                    ? ""
                                                    : String(prev?.roupa_deposito_nome ?? "").trim() || depRoupa,
                                        }));
                                    }}
                                />

                                {roupaUsoErro && <div className="mt-1 text-xs text-red-600">{roupaUsoErro}</div>}

                                {roupaUsoVal === "Sim" && (
                                    <div className="mt-3">
                                        <EstoqueCombobox
                                            inputId="wizard-roupa"
                                            label="Roupa para selecionar"
                                            required={obrigatoriedadeAtiva}
                                            placeholder={step.placeholder || 'Selecione no estoque ou use "ROUPA PRÓPRIA"'}
                                            initialValue={String((wizardData as any).roupa ?? "")}
                                            disabled={wizardSubmitting}
                                            depositoLabel="Local da Roupa"
                                            depositoOptions={[
                                                { value: "ARMARIO SANDRO", label: "ARMARIO SANDRO" },
                                                { value: "ARMARIO ILDO", label: "ARMARIO ILDO" },
                                                { value: "FUNERARIA", label: "FUNERARIA" },
                                            ]}
                                            depositoValue={depRoupa}
                                            onChangeDeposito={(v) => {
                                                const next = normalizeDepRoupa(v);
                                                setDepRoupa(next);

                                                if (isRoupaPropria((wizardData as any).roupa)) return;

                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    roupa: "",
                                                    roupa_deposito_nome: next,
                                                    roupa_produto_id: 0,
                                                    roupa_codigo_barras: "",
                                                }));

                                                validarRoupaSeNecessario();
                                            }}
                                            action="roupas_buscar"
                                            errorText={roupaErro}
                                            onBlurValidate={validarRoupaSeNecessario}
                                            onTypingInvalidate={(typed) => {
                                                if (typed && isRoupaPropria(typed)) {
                                                    setWizardData((prev: any) => ({
                                                        ...prev,
                                                        roupa: "ROUPA PRÓPRIA",
                                                        roupa_deposito_nome: "",
                                                        roupa_produto_id: 0,
                                                        roupa_codigo_barras: "",
                                                    }));
                                                    setRoupaErro("");
                                                    return;
                                                }

                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    roupa: typed,
                                                    roupa_deposito_nome: depRoupa,
                                                    roupa_produto_id: 0,
                                                    roupa_codigo_barras: "",
                                                }));
                                            }}
                                            onSelectRow={(it) => {
                                                const pid = getPidFromRow(it);
                                                const cb = String((it as any).codigo_barras || "").trim();

                                                setWizardData((prev: any) => ({
                                                    ...prev,
                                                    roupa: String(it.nome || "").trim(),
                                                    roupa_deposito_nome: depRoupa,
                                                    roupa_produto_id: pid,
                                                    roupa_codigo_barras: cb,
                                                    roupa_propria: 0,
                                                }));

                                                setRoupaErro("");
                                            }}
                                            extraButtons={
                                                <>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                                        disabled={wizardSubmitting}
                                                        onClick={() => {
                                                            setWizardData((prev: any) => ({
                                                                ...prev,
                                                                roupa: "ROUPA PRÓPRIA",
                                                                roupa_deposito_nome: "",
                                                                roupa_produto_id: 0,
                                                                roupa_codigo_barras: "",
                                                                roupa_propria: 1,
                                                            }));

                                                            const el = document.getElementById("wizard-roupa") as HTMLInputElement | null;
                                                            if (el) {
                                                                el.value = "ROUPA PRÓPRIA";
                                                                el.dispatchEvent(new Event("input", { bubbles: true }));
                                                                el.dispatchEvent(new Event("change", { bubbles: true }));
                                                                el.blur();
                                                            }

                                                            setRoupaErro("");
                                                            requestAnimationFrame(() => validarRoupaSeNecessario());
                                                        }}
                                                    >
                                                        Usar ROUPA PRÓPRIA
                                                    </button>

                                                    {isPropria ? (
                                                        <span className="self-center text-[11px] text-slate-500">
                                                            Roupa própria não usa estoque.
                                                        </span>
                                                    ) : null}
                                                </>
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       VÉU (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "veu" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={veuVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!(veuSelectErro || veuErro)}
                                    onChange={(v) => {
                                        setVeuVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            veu: v,
                                            ...(v !== "Sim"
                                                ? {
                                                    veu_deposito_nome: "",
                                                    veu_produto_id: 0,
                                                    veu_codigo_barras: "",
                                                    veu_item: "",
                                                }
                                                : {}),
                                        }));

                                        setVeuSelectErro("");
                                        if (v !== "Sim") setVeuErro("");
                                    }}
                                />

                                {veuSelectErro && <div className="mt-1 text-xs text-red-600">{veuSelectErro}</div>}
                                {veuErro && <div className="mt-1 text-xs text-red-600">{veuErro}</div>}
                            </div>
                        );
                    }

                    /* ===========================
                       VÉU ITEM (async) - só se veu=Sim
                       =========================== */
                    if (step.type === "async_veu" && step.id === "veu_item") {
                        if (veuVal !== "Sim") return null;

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <EstoqueCombobox
                                    inputId="wizard-veu_item"
                                    label="VÉU (estoque)"
                                    required={isRequired("veu")}
                                    placeholder={step.placeholder || "Selecione no estoque…"}
                                    initialValue={String((wizardData as any).veu_item ?? "")}
                                    disabled={wizardSubmitting}
                                    depositoLabel="Local do VÉU"
                                    depositoOptions={[
                                        { value: "ARMARIO SANDRO", label: "ARMARIO SANDRO" },
                                        { value: "ARMARIO ILDO", label: "ARMARIO ILDO" },
                                        { value: "FUNERARIA", label: "FUNERARIA" },
                                    ]}
                                    depositoValue={depVeu}
                                    onChangeDeposito={(v) => {
                                        const next = normalizeDepVeu(v);
                                        setDepVeu(next);
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            veu_item: "",
                                            veu_deposito_nome: next,
                                            veu_produto_id: 0,
                                            veu_codigo_barras: "",
                                        }));
                                        validarVeuSeNecessario();
                                    }}
                                    action="veus_buscar"
                                    errorText={veuErro}
                                    onBlurValidate={validarVeuSeNecessario}
                                    onTypingInvalidate={(typed) => {
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            veu_item: typed,
                                            veu_deposito_nome: depVeu,
                                            veu_produto_id: 0,
                                            veu_codigo_barras: "",
                                        }));
                                    }}
                                    onSelectRow={(it) => {
                                        const pid = getPidFromRow(it);
                                        const cb = String((it as any).codigo_barras || "").trim();

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            veu: "Sim",
                                            veu_item: String(it.nome || "").trim(),
                                            veu_deposito_nome: depVeu,
                                            veu_produto_id: pid,
                                            veu_codigo_barras: cb,
                                        }));

                                        setVeuErro("");
                                    }}
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       CORDÃO (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "cordao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={cordaoVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!(cordaoSelectErro || cordaoErro)}
                                    onChange={(v) => {
                                        setCordaoVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cordao: v,
                                            ...(v !== "Sim"
                                                ? {
                                                    cordao_deposito_nome: "",
                                                    cordao_produto_id: 0,
                                                    cordao_codigo_barras: "",
                                                    cordao_item: "",
                                                }
                                                : {}),
                                        }));

                                        setCordaoSelectErro("");
                                        if (v !== "Sim") setCordaoErro("");
                                    }}
                                />

                                {cordaoSelectErro && <div className="mt-1 text-xs text-red-600">{cordaoSelectErro}</div>}
                                {cordaoErro && <div className="mt-1 text-xs text-red-600">{cordaoErro}</div>}
                            </div>
                        );
                    }

                    /* ===========================
                       CORDÃO ITEM (async) - só se cordao=Sim
                       =========================== */
                    if (step.type === "async_cordao" && step.id === "cordao_item") {
                        if (cordaoVal !== "Sim") return null;

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <EstoqueCombobox
                                    inputId="wizard-cordao_item"
                                    label="CORDÃO (estoque)"
                                    required={isRequired("cordao")}
                                    placeholder={step.placeholder || "Selecione no estoque…"}
                                    initialValue={String((wizardData as any).cordao_item ?? "")}
                                    disabled={wizardSubmitting}
                                    depositoLabel="Local do CORDÃO"
                                    depositoOptions={[
                                        { value: "ARMARIO SANDRO", label: "ARMARIO SANDRO" },
                                        { value: "ARMARIO ILDO", label: "ARMARIO ILDO" },
                                        { value: "FUNERARIA", label: "FUNERARIA" },
                                    ]}
                                    depositoValue={depCordao}
                                    onChangeDeposito={(v) => {
                                        const next = normalizeDepCordao(v);
                                        setDepCordao(next);
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cordao_item: "",
                                            cordao_deposito_nome: next,
                                            cordao_produto_id: 0,
                                            cordao_codigo_barras: "",
                                        }));
                                        validarCordaoSeNecessario();
                                    }}
                                    action="cordoes_buscar"
                                    errorText={cordaoErro}
                                    onBlurValidate={validarCordaoSeNecessario}
                                    onTypingInvalidate={(typed) => {
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cordao_item: typed,
                                            cordao_deposito_nome: depCordao,
                                            cordao_produto_id: 0,
                                            cordao_codigo_barras: "",
                                        }));
                                    }}
                                    onSelectRow={(it) => {
                                        const pid = getPidFromRow(it);
                                        const cb = String((it as any).codigo_barras || "").trim();

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cordao: "Sim",
                                            cordao_item: String(it.nome || "").trim(),
                                            cordao_deposito_nome: depCordao,
                                            cordao_produto_id: pid,
                                            cordao_codigo_barras: cb,
                                        }));

                                        setCordaoErro("");
                                    }}
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       local_velorio com GPS (datalist)
                       + Sala 01 / Sala 02 / Sala 03
                       + Velório Online obrigatório quando escolher sala
                       =========================== */
                    if (step.id === "local_velorio" && step.type === "datalist") {
                        const listId = `dl-${step.id}`;
                        const currentText = String((wizardData as any)[step.id] ?? "");
                        const salaAtual = String(salaVelorioVal || (wizardData as any).sala_velorio || "").trim();
                        const onlineAtual = String(velorioOnlineVal || (wizardData as any).velorio_online || "").trim();
                        const mostraVelorioOnline = !!salaAtual;

                        const selecionarSala = (sala: string) => {
                            const nextSala = salaAtual === sala ? "" : sala;
                            const nextOnline = nextSala ? onlineAtual : "";

                            setSalaVelorioVal(nextSala);
                            setVelorioOnlineVal(nextOnline);
                            setVelorioOnlineErro("");

                            setWizardData((prev: any) => ({
                                ...prev,
                                sala_velorio: nextSala,
                                velorio_online: nextOnline,
                            }));
                        };

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    Velório Online {obrigatoriedadeAtiva && <span className="text-red-600">*</span>}
                                </label>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        key={`${wizardStep}-${step.id}`} // ✅ força remount do defaultValue por step (evita “travadas”)
                                        ref={localVelorioRef}
                                        id={`wizard-${step.id}`}
                                        list={listId}
                                        placeholder={step.placeholder || "Digite o endereço ou use o GPS"}
                                        defaultValue={currentText}
                                        className="w-full flex-1 rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                        disabled={wizardSubmitting}
                                    />

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                                            onClick={preencherLocalVelorioComGPS}
                                            disabled={wizardSubmitting || gpsLoading}
                                            title="Capturar localização e gerar link de rota"
                                        >
                                            {gpsLoading ? "Capturando…" : "Usar GPS"}
                                        </button>

                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                                            onClick={() => {
                                                if (localVelorioRef.current) localVelorioRef.current.value = "";
                                                setGpsMsg(null);
                                            }}
                                            disabled={wizardSubmitting}
                                            title="Limpar para digitar manualmente"
                                        >
                                            Limpar
                                        </button>
                                    </div>
                                </div>

                                <datalist id={listId}>
                                    {(step.datalist || []).map((op) => (
                                        <option key={op} value={op} />
                                    ))}
                                </datalist>

                                {gpsMsg && (
                                    <div className={`mt-2 text-xs ${gpsMsg.includes("capturada") ? "text-emerald-700" : "text-red-600"}`}>
                                        {gpsMsg}
                                    </div>
                                )}

                                {/* ✅ Campos reais/ocultos para o salvarGrupoWizard ler pelo DOM */}
                                <input id="wizard-sala_velorio" type="hidden" value={salaAtual} readOnly />
                                <input id="wizard-velorio_online" type="hidden" value={onlineAtual} readOnly />

                                <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                                    <label className="block text-sm font-medium">
                                        Sala do Velório <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                                    </label>

                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {SALAS_VELORIO.map((sala) => {
                                            const checked = salaAtual === sala;
                                            return (
                                                <button
                                                    key={sala}
                                                    type="button"
                                                    data-wizard-error={velorioOnlineErro ? "1" : "0"}
                                                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${checked
                                                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                                        : "bg-white text-slate-700 hover:bg-slate-100"
                                                        }`}
                                                    disabled={wizardSubmitting}
                                                    aria-pressed={checked}
                                                    onClick={() => selecionarSala(sala)}
                                                >
                                                    {sala}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {mostraVelorioOnline && (
                                        <div className="mt-4">
                                            <label className="mb-1 block text-sm font-medium">
                                                Velório Online <span className="text-red-600">*</span>
                                            </label>

                                            <select
                                                className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${velorioOnlineErro ? "border-red-500" : ""
                                                    }`}
                                                value={onlineAtual}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setVelorioOnlineVal(v);
                                                    setWizardData((prev: any) => ({
                                                        ...prev,
                                                        sala_velorio: salaAtual,
                                                        velorio_online: v,
                                                    }));
                                                    if (v === "Sim" || v === "Não") setVelorioOnlineErro("");
                                                }}
                                                onBlur={() => validarVelorioOnlineSeNecessario()}
                                                disabled={wizardSubmitting}
                                            >
                                                <option value="" disabled>
                                                    Selecione…
                                                </option>
                                                {VELORIO_ONLINE_OPCOES.map((op) => (
                                                    <option key={op} value={op}>
                                                        {op}
                                                    </option>
                                                ))}
                                            </select>

                                            {velorioOnlineErro && <div className="mt-1 text-xs text-red-600">{velorioOnlineErro}</div>}
                                        </div>
                                    )}

                                    {!mostraVelorioOnline && (
                                        <p className="mt-2 text-xs text-slate-500">
                                            {obrigatoriedadeAtiva
                                                ? "Ao marcar uma sala, será obrigatório informar se terá Velório Online."
                                                : "Velório Online ficará obrigatório somente após Corpo na Clínica."}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    // ✅ Estes campos são renderizados dentro do bloco Local do Velório acima.
                    // Mantemos os IDs ocultos para o salvarGrupoWizard ler e salvar corretamente.
                    if (step.id === "sala_velorio" || step.id === "velorio_online") {
                        return null;
                    }

                    /* ===========================
                       custom arrumacao
                       =========================== */
                    if (step.type === "custom" && step.id === "arrumacao") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                                    <button
                                        type="button"
                                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                                        onClick={() => setArrumacaoOpen(true)}
                                        disabled={wizardSubmitting}
                                    >
                                        Selecionar Itens…
                                    </button>
                                    <span className="text-sm text-muted-foreground">{arrumacaoSelecionadaResumo || "Nenhum item selecionado"}</span>
                                </div>
                                <input id="wizard-arrumacao" type="hidden" defaultValue="__custom__" />
                            </div>
                        );
                    }

                    /* ===========================
                       assistência (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "assistencia" && step.type === "select") {
                        const showRequiredStar = isRequired(step.id) || requireAssistencia;

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {showRequiredStar && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={assistenciaVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!assistenciaErro}
                                    onChange={(v) => {
                                        setAssistenciaVal(v);
                                        setAssistenciaErro("");

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            assistencia: v,
                                        }));

                                        if (v === "Não") setMateriaisOpen(false);
                                    }}
                                />

                                {assistenciaErro && <div className="mt-1 text-xs text-red-600">{assistenciaErro}</div>}

                                {assistenciaVal === "Sim" && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                                            onClick={() => setMateriaisOpen(true)}
                                            disabled={wizardSubmitting}
                                        >
                                            Selecionar Materiais…
                                        </button>
                                        <span className="text-xs text-muted-foreground">
                                            {materiaisSelecionadosResumo || "Nenhum material selecionado"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       tanatopraxia (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "tanato" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={tanatoVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!tanatoSelectErro}
                                    onChange={(v) => {
                                        setTanatoVal(v);
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            tanato: v,
                                        }));
                                        setTanatoSelectErro("");

                                        if (v !== "Sim") setArrumacaoOpen(false);
                                    }}
                                />

                                {tanatoSelectErro && <div className="mt-1 text-xs text-red-600">{tanatoSelectErro}</div>}
                            </div>
                        );
                    }

                    /* ===========================
                       ornamentação (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "ornamentacao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={ornamentacaoVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!ornamentacaoSelectErro}
                                    onChange={(v) => {
                                        setOrnamentacaoVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            ornamentacao: v,
                                            ...(v !== "Sim" ? { ornamentacao_tipo: "" } : {}),
                                        }));

                                        setOrnamentacaoSelectErro("");
                                        if (v !== "Sim") setOrnamentacaoTipoErro("");
                                    }}
                                />

                                {ornamentacaoSelectErro && (
                                    <div className="mt-1 text-xs text-red-600">{ornamentacaoSelectErro}</div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       INVOL (checkbox Sim/Não)
                       =========================== */
                    if (step.id === "invol" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={involVal}
                                    options={SIM_NAO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!(involSelectErro || involErro)}
                                    onChange={(v) => {
                                        setInvolVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol: v,
                                            ...(v !== "Sim"
                                                ? {
                                                    invol_deposito_nome: "",
                                                    invol_produto_id: 0,
                                                    invol_codigo_barras: "",
                                                    invol_item: "",
                                                }
                                                : {}),
                                        }));

                                        setInvolSelectErro("");
                                        if (v !== "Sim") setInvolErro("");
                                    }}
                                />

                                {involSelectErro && <div className="mt-1 text-xs text-red-600">{involSelectErro}</div>}
                            </div>
                        );
                    }

                    /* ===========================
                       INVOL ITEM (async) - só se invol=Sim
                       =========================== */
                    if (step.type === "async_invol" && step.id === "invol_item") {
                        if (involVal !== "Sim") return null;

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <EstoqueCombobox
                                    inputId="wizard-invol_item"
                                    label="INVOL (estoque)"
                                    required={isRequired("invol")}
                                    placeholder={step.placeholder || "Selecione no estoque…"}
                                    initialValue={String((wizardData as any).invol_item ?? "")}
                                    disabled={wizardSubmitting}
                                    depositoLabel="Local do INVOL"
                                    depositoOptions={[
                                        { value: "ARMARIO SANDRO", label: "ARMARIO SANDRO" },
                                        { value: "ARMARIO ILDO", label: "ARMARIO ILDO" },
                                    ]}
                                    depositoValue={depInvol}
                                    onChangeDeposito={(v) => {
                                        const next = normalizeDepInvol(v);
                                        setDepInvol(next);
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol_item: "",
                                            invol_deposito_nome: next,
                                            invol_produto_id: 0,
                                            invol_codigo_barras: "",
                                        }));
                                        validarInvolSeNecessario();
                                    }}
                                    action="invols_buscar"
                                    errorText={involErro}
                                    onBlurValidate={validarInvolSeNecessario}
                                    onTypingInvalidate={(typed) => {
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol_item: typed,
                                            invol_deposito_nome: depInvol,
                                            invol_produto_id: 0,
                                            invol_codigo_barras: "",
                                        }));
                                    }}
                                    onSelectRow={(it) => {
                                        const pid = getPidFromRow(it);
                                        const cb = String((it as any).codigo_barras || "").trim();

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol_item: String(it.nome || "").trim(),
                                            invol_deposito_nome: depInvol,
                                            invol_produto_id: pid,
                                            invol_codigo_barras: cb,
                                        }));

                                        setInvolErro("");
                                    }}
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       tipo de ornamentação (checkbox Natural/Artificial)
                       =========================== */
                    if (step.id === "ornamentacao_tipo" && step.type === "select") {
                        const ornamentacaoTipoVal = String((wizardData as any).ornamentacao_tipo ?? "");

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired("ornamentacao") && <span className="text-red-600"> *</span>}
                                </label>

                                <CheckboxChoiceGroup
                                    inputId={`wizard-${step.id}`}
                                    ariaLabel={step.label}
                                    value={ornamentacaoTipoVal}
                                    options={ORNAMENTACAO_TIPO_OPTIONS}
                                    disabled={wizardSubmitting}
                                    hasError={!!ornamentacaoTipoErro}
                                    onChange={(v) => {
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            ornamentacao_tipo: v,
                                        }));
                                        setOrnamentacaoTipoErro("");
                                    }}
                                />

                                {ornamentacaoTipoErro && (
                                    <div className="mt-1 text-xs text-red-600">{ornamentacaoTipoErro}</div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       FOTO DO FALECIDO (upload real)
                       - mantém foto_falecido como caminho/URL salvo
                       - envia a nova imagem em foto_falecido_base64 para o backend salvar fisicamente
                       =========================== */
                    if (step.id === "foto_falecido" || step.type === "file") {
                        const fotoAtual = String((wizardData as any).foto_falecido ?? "");
                        const fotoBase64 = String((wizardData as any).foto_falecido_base64 ?? "");
                        const fotoNome = String((wizardData as any).foto_falecido_nome ?? "");
                        const previewSrc = normalizarFotoSrc(fotoBase64 || fotoAtual);

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                                    <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
                                        {previewSrc ? (
                                            <img
                                                src={previewSrc}
                                                alt="Prévia da foto do falecido"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <span className="px-2 text-center text-xs text-slate-500">Sem foto</span>
                                        )}
                                    </div>

                                    <div>
                                        {/* valor persistido no banco; o FileReader envia a nova imagem em foto_falecido_base64 */}
                                        <input
                                            id={`wizard-${step.id}`}
                                            type="hidden"
                                            value={fotoAtual}
                                            readOnly
                                        />

                                        <input
                                            id={`wizard-${step.id}_file`}
                                            type="file"
                                            accept={step.accept || "image/*"}
                                            className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                            disabled={wizardSubmitting}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];

                                                if (!file) return;

                                                if (!file.type.startsWith("image/")) {
                                                    alert("Selecione um arquivo de imagem válido.");
                                                    e.currentTarget.value = "";
                                                    return;
                                                }

                                                const maxBytes = 5 * 1024 * 1024;
                                                if (file.size > maxBytes) {
                                                    alert("A imagem deve ter no máximo 5MB.");
                                                    e.currentTarget.value = "";
                                                    return;
                                                }

                                                try {
                                                    const dataUrl = await fileToDataURL(file);

                                                    setWizardData((prev: any) => ({
                                                        ...prev,
                                                        foto_falecido_base64: dataUrl,
                                                        foto_falecido_nome: file.name,
                                                        foto_falecido_tipo: file.type,
                                                        foto_falecido_tamanho: file.size,
                                                    }));
                                                } catch (err: any) {
                                                    alert(err?.message || "Erro ao carregar a imagem.");
                                                    e.currentTarget.value = "";
                                                }
                                            }}
                                        />

                                        <div className="mt-2 text-xs text-slate-500">
                                            {fotoNome ? (
                                                <>
                                                    Nova foto selecionada: <b>{fotoNome}</b>
                                                </>
                                            ) : fotoAtual ? (
                                                <>
                                                    Foto atual: <b>{fotoAtual}</b>
                                                </>
                                            ) : (
                                                <>Selecione uma imagem JPG, PNG ou WEBP.</>
                                            )}
                                        </div>

                                        {(fotoAtual || fotoBase64) && (
                                            <button
                                                type="button"
                                                className="mt-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                                                disabled={wizardSubmitting}
                                                onClick={() => {
                                                    setWizardData((prev: any) => ({
                                                        ...prev,
                                                        foto_falecido: "",
                                                        foto_falecido_base64: "",
                                                        foto_falecido_nome: "",
                                                        foto_falecido_tipo: "",
                                                        foto_falecido_tamanho: 0,
                                                    }));

                                                    const fileEl = document.getElementById(`wizard-${step.id}_file`) as HTMLInputElement | null;
                                                    if (fileEl) fileEl.value = "";
                                                }}
                                            >
                                                Remover foto
                                            </button>
                                        )}

                                        <p className="mt-2 text-[11px] text-slate-400">
                                            ATENÇÃO: Essa foto será usada no obituário, painel e página de homenagens.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    /* ===========================
                       defaults
                       =========================== */
                    if (step.type === "input") {
                        const isCpfResponsavel = step.id === "cpf_responsavel";

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <input
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step (defaultValue confiável)
                                    id={`wizard-${step.id}`}
                                    type="text"
                                    inputMode={isCpfResponsavel ? "numeric" : undefined}
                                    maxLength={isCpfResponsavel ? 11 : undefined}
                                    pattern={isCpfResponsavel ? "\\d{11}" : undefined}
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    onInput={(e) => {
                                        if (!isCpfResponsavel) return;

                                        const el = e.currentTarget;
                                        const somenteNumeros = el.value.replace(/\D/g, "").slice(0, 11);

                                        if (el.value !== somenteNumeros) {
                                            el.value = somenteNumeros;
                                        }

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cpf_responsavel: somenteNumeros,
                                        }));
                                    }}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

                    if (step.type === "textarea") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <textarea
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step
                                    id={`wizard-${step.id}`}
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    rows={3}
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

                    if (step.type === "select") {
                        const options = step.options && step.options.length > 0 ? step.options : ["Sim", "Não"];

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <select
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    disabled={wizardSubmitting}
                                >
                                    <option value="" disabled>
                                        Selecione…
                                    </option>

                                    {options.filter(Boolean).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    if (step.type === "date") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <input
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step
                                    id={`wizard-${step.id}`}
                                    type="date"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

                    if (step.type === "time") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <input
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step
                                    id={`wizard-${step.id}`}
                                    type="time"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

                    if (step.type === "datalist") {
                        const listId = `dl-${step.id}`;
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <input
                                    key={`${wizardStep}-${step.id}`} // ✅ remount por step
                                    id={`wizard-${step.id}`}
                                    list={listId}
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-base disabled:opacity-60"
                                    disabled={wizardSubmitting}
                                />
                                <datalist id={listId}>
                                    {(step.datalist || []).map((op) => (
                                        <option key={op} value={op} />
                                    ))}
                                </datalist>
                            </div>
                        );
                    }

                    return null;
                })}
            </div>

            <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                    {isRestrito && (
                        <>
                            Editando apenas: <b>{wizardStepTitles[wizardRestrictGroup!]}</b>
                        </>
                    )}
                </div>

                <div className="flex gap-2">
                    <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-60" onClick={onClose} disabled={wizardSubmitting}>
                        Cancelar
                    </button>

                    {isRestrito ? (
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                            onClick={tentarConcluir}
                            disabled={wizardSubmitting || bloqueiaPorAssistencia}
                            aria-busy={wizardSubmitting}
                            title={bloqueiaPorAssistencia ? 'Selecione "Sim" ou "Não" em Assistência' : undefined}
                        >
                            {wizardSubmitting ? "Salvando…" : "Salvar"}
                        </button>
                    ) : (
                        <>
                            {wizardStep > 0 && (
                                <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-60" onClick={goPrev} disabled={wizardSubmitting}>
                                    Anterior
                                </button>
                            )}
                            {isLastStep ? (
                                <button
                                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                                    onClick={tentarConcluir}
                                    disabled={wizardSubmitting || bloqueiaPorAssistencia}
                                    aria-busy={wizardSubmitting}
                                    title={bloqueiaPorAssistencia ? 'Selecione "Sim" ou "Não" em Assistência' : undefined}
                                >
                                    {wizardSubmitting ? "Salvando…" : "Concluir"}
                                </button>
                            ) : (
                                <button
                                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                                    onClick={goNext}
                                    disabled={wizardSubmitting || bloqueiaPorAssistencia}
                                    title={bloqueiaPorAssistencia ? 'Selecione "Sim" ou "Não" em Assistência' : undefined}
                                >
                                    Próximo
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
}
