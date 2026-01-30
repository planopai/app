"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";
import { API as API_ROOT } from "./constants";

// ✅ NOVO: modal de seleção guiada (vou gerar no próximo passo)
import RoupaPickerModal, { RoupaPickResult } from "./RoupaPickerModal";


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
    | "async_urna"
    | "async_roupa"
    | "async_invol";
    options?: string[];
    placeholder?: string;
    datalist?: string[];
};

type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

const ESTOQUE_API = `${API_ROOT}/api/php/materiais_gerais.php`;

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
    return Number((it as any).id ?? (it as any).produto_id ?? (it as any).est_produto_id ?? 0) || 0;
}

type DepUrna = "MEMORIAL" | "FUNERARIA";
type DepRoupa = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA";
type DepInvol = "ARMARIO SANDRO" | "ARMARIO ILDO";

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

/* =========================================================================
   Combobox genérico (estoque)
   - action: "urnas_buscar" | "invols_buscar"
   ========================================================================= */
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
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState(initialValue || "");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const lastInitSigRef = useRef<string>("");

    // sincroniza ao abrir/editar sem atrapalhar digitação
    useEffect(() => {
        const isFocused = typeof document !== "undefined" && document.activeElement === inputRef.current;
        if (isFocused || open) return;

        const sig = `${String(initialValue || "")}||${String(depositoValue || "")}`;
        if (lastInitSigRef.current === sig) return;
        lastInitSigRef.current = sig;

        setQ(initialValue || "");
        setRows([]);
        setErr("");
        setOpen(false);
    }, [initialValue, depositoValue, open]);

    // fecha ao clicar fora
    useEffect(() => {
        const onDoc = (e: PointerEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDoc, true);
        return () => document.removeEventListener("pointerdown", onDoc, true);
    }, []);

    // busca async
    useEffect(() => {
        if (!open) return;

        const qq = q.trim();
        setErr("");

        if (qq.length < 2) {
            setRows([]);
            return;
        }

        const ac = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", action);
                url.searchParams.set("q", qq);
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "30");
                url.searchParams.set("deposito_nome", String(depositoValue || ""));

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                const j = await r.json().catch(() => null);
                if (!j?.ok) throw new Error(j?.msg || "Falha ao buscar itens no estoque");
                setRows((j.rows || []) as EstoqueRow[]);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setErr(e?.message || "Erro na busca");
                setRows([]);
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [q, open, action, depositoValue]);

    const applySelection = (it: EstoqueRow) => {
        const pid = getPidFromRow(it);
        if (!pid || pid <= 0) {
            setErr("Este item veio sem produto_id. Contate o suporte.");
            onBlurValidate?.();
            return;
        }

        setQ(String(it.nome || ""));
        setErr("");
        setOpen(false);

        onSelectRow(it);
        onBlurValidate?.();
        requestAnimationFrame(() => inputRef.current?.blur());
    };

    const autoPickIfExactMatch = () => {
        const txt = q.trim().toLowerCase();
        if (txt.length < 2) return;
        if (!rows?.length) return;

        const match = rows.find((it) => String(it.nome || "").trim().toLowerCase() === txt);
        if (match) applySelection(match);
    };

    return (
        <div ref={wrapRef}>
            <div className="relative">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr] sm:gap-2">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">{depositoLabel}</label>
                        <select
                            className="w-full rounded-md border px-2 py-2 text-sm disabled:opacity-60"
                            value={depositoValue}
                            onChange={(e) => {
                                onChangeDeposito(e.target.value);
                                setRows([]);
                                setErr("");
                                setOpen(true);
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

                        <input
                            id={inputId}
                            ref={inputRef}
                            type="text"
                            placeholder={placeholder || "Digite para buscar..."}
                            value={q}
                            onChange={(e) => {
                                const v = e.target.value;
                                setQ(v);
                                setOpen(true);
                                setErr("");
                                onTypingInvalidate?.(v);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (!rows?.length) return;
                                    applySelection(rows[0]);
                                }
                            }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => {
                                autoPickIfExactMatch();
                                onBlurValidate?.();
                            }}
                            className={`w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${errorText ? "border-red-500" : ""}`}
                            disabled={disabled}
                            autoComplete="off"
                            title={label}
                        />

                        {errorText ? <div className="mt-1 text-xs text-red-600">{errorText}</div> : null}
                    </div>
                </div>

                {open ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
                        {loading ? (
                            <div className="p-3 text-sm text-slate-600">Buscando...</div>
                        ) : err ? (
                            <div className="p-3 text-sm text-red-600">{err}</div>
                        ) : q.trim().length < 2 ? (
                            <div className="p-3 text-sm text-slate-600">Digite pelo menos 2 letras…</div>
                        ) : rows.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600">Nenhum item encontrado no estoque ({depositoValue}).</div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {rows.map((it) => {
                                    const pidKey = getPidFromRow(it);
                                    return (
                                        <li key={pidKey || it.nome}>
                                            <button
                                                type="button"
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    applySelection(it);
                                                }}
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
                ) : null}
            </div>

            <p className="mt-1 text-[11px] text-slate-500">Dica: digite parte do nome (ou código). Ao selecionar, a lista fecha.</p>

            {footerHint ? <div className="mt-1 text-[11px] text-slate-400">{footerHint}</div> : null}
        </div>
    );
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

    const [assistenciaErro, setAssistenciaErro] = useState<string>("");
    const [urnaErro, setUrnaErro] = useState<string>("");
    const [roupaErro, setRoupaErro] = useState<string>("");
    const [involErro, setInvolErro] = useState<string>("");

    // depósitos locais (controlados)
    const [depUrna, setDepUrna] = useState<DepUrna>("MEMORIAL");
    const [depInvol, setDepInvol] = useState<DepInvol>("ARMARIO SANDRO");

    // ✅ NOVO: modal de roupa + cordão
    const [roupaPickerOpen, setRoupaPickerOpen] = useState(false);

    useEffect(() => {
        setOrnamentacaoVal(String((wizardData as any).ornamentacao ?? ""));
        setInvolVal(String((wizardData as any).invol ?? ""));
    }, [open, (wizardData as any).ornamentacao, (wizardData as any).invol]);

    useEffect(() => {
        if (!open) return;

        setUrnaErro("");
        setRoupaErro("");
        setInvolErro("");
        setAssistenciaErro("");

        setDepUrna(normalizeDepUrna((wizardData as any).urna_deposito_nome ?? "MEMORIAL"));
        setDepInvol(normalizeDepInvol((wizardData as any).invol_deposito_nome ?? "ARMARIO SANDRO"));
    }, [open]);

    const assistenciaGroupIndex = useMemo(() => {
        return wizardStepIndexes.findIndex((arr) => arr.some((idx) => steps[idx]?.id === "assistencia"));
    }, [wizardStepIndexes, steps]);

    const isRestrito = typeof wizardRestrictGroup === "number";

    const requireAssistencia = useMemo(() => {
        if (assistenciaGroupIndex < 0) return false;
        if (!isRestrito) return true;
        return wizardRestrictGroup === assistenciaGroupIndex;
    }, [assistenciaGroupIndex, isRestrito, wizardRestrictGroup]);

    const grupoIndices = wizardStepIndexes[wizardStep] || [];
    const grupoSteps = useMemo(() => grupoIndices.map((i) => steps[i]), [grupoIndices, steps]);

    const assistenciaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "assistencia"), [grupoSteps]);
    const urnaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "urna"), [grupoSteps]);
    const roupaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "roupa"), [grupoSteps]);
    const involNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol"), [grupoSteps]);
    const involItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol_item"), [grupoSteps]);

    const isRequired = (id: string) => obrigatorios.includes(id);

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

    // ✅ valida URNA pelo wizardData
    const validarUrnaSeNecessario = () => {
        if (!urnaNoGrupoAtual) return true;

        const urnaTxt = String((wizardData as any).urna ?? "").trim();
        const pid = Number((wizardData as any).urna_produto_id ?? 0) || 0;
        const req = isRequired("urna");

        if ((req || urnaTxt !== "") && pid <= 0) {
            setUrnaErro("Selecione uma urna da lista (produto do estoque).");
            return false;
        }

        setUrnaErro("");
        return true;
    };

    // ✅ valida ROUPA pelo wizardData (agora roupa vem do modal)
    const validarRoupaSeNecessario = () => {
        if (!roupaNoGrupoAtual) return true;

        const roupaTxt = String((wizardData as any).roupa ?? "").trim();
        const req = isRequired("roupa");

        // se não é obrigatório e está vazio -> ok
        if (!req && roupaTxt === "") {
            setRoupaErro("");
            return true;
        }

        // roupa própria -> ok
        if (roupaTxt !== "" && isRoupaPropria(roupaTxt)) {
            setRoupaErro("");
            return true;
        }

        // roupa do estoque -> exige pid e depósito
        const pid = Number((wizardData as any).roupa_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).roupa_deposito_nome ?? "").trim();

        if (roupaTxt !== "" && pid <= 0) {
            setRoupaErro('Selecione uma roupa da lista (estoque) ou use "ROUPA PRÓPRIA".');
            return false;
        }
        if (roupaTxt !== "" && pid > 0 && dep === "") {
            setRoupaErro("Selecione o local de saída da roupa.");
            return false;
        }

        setRoupaErro("");
        return true;
    };

    // ✅ valida INVOL pelo wizardData (só se invol=Sim)
    const validarInvolSeNecessario = () => {
        if (!involNoGrupoAtual && !involItemNoGrupoAtual) return true;

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

    // ✅ resumo de roupa + cordão
    const roupaResumo = useMemo(() => {
        const roupaTxt = String((wizardData as any).roupa ?? "").trim();
        const roupaIsPropria = roupaTxt !== "" && isRoupaPropria(roupaTxt);

        const roupaPid = Number((wizardData as any).roupa_produto_id ?? 0) || 0;
        const roupaDep = String((wizardData as any).roupa_deposito_nome ?? "").trim();
        const roupaCb = String((wizardData as any).roupa_codigo_barras ?? "").trim();

        const cordaoTxt = String((wizardData as any).cordao ?? "").trim();
        const cordaoPid = Number((wizardData as any).cordao_produto_id ?? 0) || 0;
        const cordaoDep = String((wizardData as any).cordao_deposito_nome ?? "").trim();
        const cordaoCb = String((wizardData as any).cordao_codigo_barras ?? "").trim();

        const parts: string[] = [];

        if (!roupaTxt) parts.push("Roupa: (não selecionada)");
        else if (roupaIsPropria) parts.push("Roupa: ROUPA PRÓPRIA");
        else parts.push(`Roupa: ${roupaTxt} — ${roupaDep || "sem depósito"} — PID ${roupaPid || 0} — CB ${roupaCb || "-"}`);

        if (!cordaoTxt) parts.push("Cordão: (não selecionado)");
        else parts.push(`Cordão: ${cordaoTxt} — ${cordaoDep || "sem depósito"} — PID ${cordaoPid || 0} — CB ${cordaoCb || "-"}`);

        return parts.join(" • ");
    }, [wizardData]);

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

    const goNext = () => {
        if (wizardSubmitting) return;
        if (assistenciaNoGrupoAtual && !validarAssistencia()) return;
        if (!validarUrnaSeNecessario()) return;
        if (!validarRoupaSeNecessario()) return;
        if (!validarInvolSeNecessario()) return;

        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };

    const tentarConcluir = async () => {
        if (wizardSubmitting) return;
        if (assistenciaNoGrupoAtual && !validarAssistencia()) return;
        if (!validarUrnaSeNecessario()) return;
        if (!validarRoupaSeNecessario()) return;
        if (!validarInvolSeNecessario()) return;

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
            {/* ✅ MODAL DE ROUPA + CORDÃO */}
            <RoupaPickerModal
                open={roupaPickerOpen}
                onClose={() => setRoupaPickerOpen(false)}
                initial={{
                    roupa_deposito_nome: String((wizardData as any).roupa_deposito_nome ?? ""),
                    roupa: String((wizardData as any).roupa ?? ""),
                    roupa_produto_id: Number((wizardData as any).roupa_produto_id ?? 0) || 0,
                    roupa_codigo_barras: String((wizardData as any).roupa_codigo_barras ?? ""),

                    cordao_deposito_nome: String((wizardData as any).cordao_deposito_nome ?? ""),
                    cordao: String((wizardData as any).cordao ?? ""),
                    cordao_produto_id: Number((wizardData as any).cordao_produto_id ?? 0) || 0,
                    cordao_codigo_barras: String((wizardData as any).cordao_codigo_barras ?? ""),
                }}
                disabled={wizardSubmitting}
                onConfirm={(result: RoupaPickResult) => {
                    setWizardData((prev: any) => ({
                        ...prev,

                        // ROUPA
                        roupa: result.roupa_texto,
                        roupa_deposito_nome: result.roupa_deposito_nome,
                        roupa_produto_id: result.roupa_produto_id,
                        roupa_codigo_barras: result.roupa_codigo_barras,

                        // CORDÃO
                        cordao: result.cordao_texto,
                        cordao_deposito_nome: result.cordao_deposito_nome,
                        cordao_produto_id: result.cordao_produto_id,
                        cordao_codigo_barras: result.cordao_codigo_barras,
                    }));

                    setRoupaErro("");
                    setRoupaPickerOpen(false);
                }}
            />

            <div className="flex items-center gap-2">
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

                    /* ===========================
                       URNA (async)
                       =========================== */
                    if (step.type === "async_urna" && step.id === "urna") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <EstoqueCombobox
                                    inputId="wizard-urna"
                                    label="Urna"
                                    required={isRequired(step.id)}
                                    placeholder={step.placeholder || "Digite para buscar..."}
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
                                    }}
                                    footerHint={
                                        <>
                                            Obs: a baixa do estoque acontece automaticamente ao registrar <b>Ínicio da Ornamentação (fase05)</b>.
                                        </>
                                    }
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       ✅ ROUPA (novo: botão + modal)
                       =========================== */
                    if (step.type === "async_roupa" && step.id === "roupa") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    Roupa {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <button
                                        type="button"
                                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                                        onClick={() => setRoupaPickerOpen(true)}
                                        disabled={wizardSubmitting}
                                    >
                                        Selecionar roupa…
                                    </button>

                                    <span className="text-xs text-muted-foreground">
                                        {roupaResumo || "Nenhum item selecionado"}
                                    </span>
                                </div>

                                {roupaErro ? <div className="mt-1 text-xs text-red-600">{roupaErro}</div> : null}

                                {/* ✅ mantém id "wizard-roupa" para o salvarGrupoWizard (DOM) */}
                                <input
                                    id="wizard-roupa"
                                    type="hidden"
                                    value={String((wizardData as any).roupa ?? "")}
                                    readOnly
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       local_velorio com GPS
                       =========================== */
                    if (step.id === "local_velorio" && step.type === "datalist") {
                        const listId = `dl-${step.id}`;
                        const currentText = String((wizardData as any)[step.id] ?? "");

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label} <span className="text-xs text-muted-foreground">(endereço ou link)</span>
                                </label>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        ref={localVelorioRef}
                                        id={`wizard-${step.id}`}
                                        list={listId}
                                        placeholder={step.placeholder || "Digite o endereço ou use o GPS"}
                                        defaultValue={currentText}
                                        className="w-full flex-1 rounded-md border px-3 py-2 text-sm disabled:opacity-60"
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
                            </div>
                        );
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
                       assistencia (controlado)
                       =========================== */
                    if (step.id === "assistencia" && step.type === "select") {
                        const showRequiredStar = isRequired(step.id) || requireAssistencia;

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {showRequiredStar && <span className="text-red-600"> *</span>}
                                </label>

                                <select
                                    id={`wizard-${step.id}`}
                                    className={`w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${assistenciaErro ? "border-red-500" : ""}`}
                                    value={assistenciaVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setAssistenciaVal(v);
                                        if (isSimNao(v)) setAssistenciaErro("");
                                        if (v === "Não") setMateriaisOpen(false);
                                    }}
                                    onBlur={() => {
                                        if (assistenciaNoGrupoAtual) validarAssistencia();
                                    }}
                                    disabled={wizardSubmitting}
                                >
                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {(step.options || ["Sim", "Não"]).filter(Boolean).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>

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
                                        <span className="text-xs text-muted-foreground">{materiaisSelecionadosResumo || "Nenhum material selecionado"}</span>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    /* ===========================
                       tanato (controlado)
                       =========================== */
                    if (step.id === "tanato" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    value={tanatoVal}
                                    onChange={(e) => setTanatoVal(e.target.value)}
                                    disabled={wizardSubmitting}
                                >
                                    {(step.options || ["", "Sim", "Não"]).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    /* ===========================
                       ornamentacao (controlado)
                       =========================== */
                    if (step.id === "ornamentacao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    value={ornamentacaoVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setOrnamentacaoVal(v);
                                        if (v !== "Sim") {
                                            const el = document.getElementById("wizard-ornamentacao_tipo") as HTMLSelectElement | null;
                                            if (el) el.value = "";
                                        }
                                    }}
                                    disabled={wizardSubmitting}
                                >
                                    {(step.options || ["", "Sim", "Não"]).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    /* ===========================
                       INVOL (select controlado)
                       =========================== */
                    if (step.id === "invol" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    value={involVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setInvolVal(v);

                                        // espelha no wizardData
                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol: v,
                                            ...(v !== "Sim" ? { invol_deposito_nome: "", invol_produto_id: 0, invol_codigo_barras: "", invol_item: "" } : {}),
                                        }));

                                        if (v !== "Sim") setInvolErro("");
                                    }}
                                    disabled={wizardSubmitting}
                                >
                                    {(step.options || ["", "Sim", "Não"]).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
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
                                    required={true}
                                    placeholder={step.placeholder || "Digite para buscar INVOL..."}
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
                                    }}
                                />
                            </div>
                        );
                    }

                    /* ===========================
                       ornamentacao_tipo (default)
                       =========================== */
                    if (step.id === "ornamentacao_tipo" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <select
                                    id="wizard-ornamentacao_tipo"
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    defaultValue={String((wizardData as any).ornamentacao_tipo ?? "")}
                                    disabled={wizardSubmitting}
                                >
                                    {(step.options || ["", "Natural", "Artificial"]).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    /* ===========================
                       defaults: input/textarea/select/date/time/datalist
                       =========================== */
                    if (step.type === "input") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <input
                                    id={`wizard-${step.id}`}
                                    type="text"
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
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
                                    id={`wizard-${step.id}`}
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    rows={3}
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

                    if (step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    disabled={wizardSubmitting}
                                >
                                    {(step.options || [""]).map((op) => (
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
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <input
                                    id={`wizard-${step.id}`}
                                    type="date"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
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
                                    id={`wizard-${step.id}`}
                                    type="time"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
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
                                    id={`wizard-${step.id}`}
                                    list={listId}
                                    placeholder={step.placeholder || ""}
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
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
