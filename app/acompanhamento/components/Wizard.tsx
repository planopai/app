"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";
import { API as API_ROOT } from "./constants"; // ✅ ajuste o caminho se necessário

type Step = {
    label: string;
    id: string;
    type: "input" | "select" | "textarea" | "date" | "time" | "datalist" | "custom" | "async_urna";
    options?: string[];
    placeholder?: string;
    datalist?: string[];
};

type UrnaRow = {
    id: number;
    nome: string;
    codigo_barras: string;
    saldo_total: number;
};

const ESTOQUE_API = `${API_ROOT}/api/php/materiais_gerais.php`;

/* =========================
   ✅ COMBOBOX URNA (async) + DEPÓSITO
   - seleciona depósito (MEMORIAL/FUNERARIA)
   - digita -> busca no estoque filtrando por depósito
   - seleciona -> fecha lista
   - mantém id="wizard-urna" (para salvarGrupoWizard continuar funcionando)
========================= */
function UrnaCombobox({
    label,
    required,
    placeholder,
    initialValue,
    disabled,
}: {
    label: string;
    required: boolean;
    placeholder?: string;
    initialValue: string;
    disabled?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState(initialValue || "");
    const [dep, setDep] = useState<"MEMORIAL" | "FUNERARIA">("MEMORIAL"); // ✅ NOVO
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<UrnaRow[]>([]);

    // sincroniza quando abre/edita registro
    useEffect(() => {
        setQ(initialValue || "");
        setRows([]);
        setErr("");
        setOpen(false);
    }, [initialValue]);

    // fecha ao clicar fora
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // debounce + abort
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
                url.searchParams.set("action", "urnas_buscar");
                url.searchParams.set("q", qq);
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "30");

                // ✅ NOVO: filtra por depósito
                url.searchParams.set("deposito_nome", dep);

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                const j = await r.json().catch(() => null);

                if (!j?.ok) {
                    throw new Error(j?.msg || "Falha ao buscar urnas");
                }

                setRows((j.rows || []) as UrnaRow[]);
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
    }, [q, open, dep]); // ✅ inclui dep

    return (
        <div ref={wrapRef}>
            <label className="mb-1 block text-sm font-medium">
                {label}
                {required && <span className="text-red-600"> *</span>}
            </label>

            <div className="relative">
                {/* ✅ Depósito + Input lado a lado */}
                <div className="flex gap-2">
                    <select
                        className="w-[160px] rounded-md border px-2 py-2 text-sm disabled:opacity-60"
                        value={dep}
                        onChange={(e) => {
                            setDep(e.target.value as any);
                            setRows([]);
                            setErr("");
                            setOpen(true);
                        }}
                        disabled={disabled}
                        title="Depósito"
                    >
                        <option value="MEMORIAL">MEMORIAL</option>
                        <option value="FUNERARIA">FUNERARIA</option>
                    </select>

                    {/* ✅ ESTE INPUT É O QUE O salvarGrupoWizard DEVE LER (id wizard-urna) */}
                    <input
                        ref={inputRef}
                        id="wizard-urna"
                        type="text"
                        placeholder={placeholder || "Digite para buscar..."}
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                        disabled={disabled}
                        autoComplete="off"
                    />
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
                            <div className="p-3 text-sm text-slate-600">
                                Nenhuma urna encontrada no estoque ({dep}).
                            </div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {rows.map((it) => (
                                    <li key={it.id}>
                                        <button
                                            type="button"
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                            onMouseDown={(e) => e.preventDefault()} // evita blur antes do clique
                                            onClick={() => {
                                                setQ(it.nome);
                                                setOpen(false);
                                                requestAnimationFrame(() => inputRef.current?.blur());
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium text-slate-900">{it.nome}</span>
                                                <span className="shrink-0 text-xs text-slate-600">
                                                    estoque: <b>{Number(it.saldo_total) || 0}</b>
                                                </span>
                                            </div>
                                            <div className="mt-0.5 truncate text-xs text-slate-600">
                                                CB: <b>{it.codigo_barras}</b>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
                Dica: escolha o depósito e digite parte do nome (ou código). Ao selecionar, a lista fecha.
            </p>
        </div>
    );
}

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

    /** NOVO: trava cliques duplos e mostra "Salvando…" */
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
    concluirWizard: () => void;

    /** NOVO */
    wizardSubmitting: boolean;
}) {
    // ✅ controle local só para visibilidade do "Tipo de Ornamentação"
    const [ornamentacaoVal, setOrnamentacaoVal] = useState<string>("");

    useEffect(() => {
        setOrnamentacaoVal(String((wizardData as any).ornamentacao ?? ""));
    }, [open, (wizardData as any).ornamentacao]);

    // ==================== Assistência obrigatória ====================
    const isSimNao = (v: string) => v === "Sim" || v === "Não";

    const [assistenciaErro, setAssistenciaErro] = useState<string>("");

    useEffect(() => {
        if (open) setAssistenciaErro("");
    }, [open]);

    const assistenciaGroupIndex = useMemo(() => {
        return wizardStepIndexes.findIndex((arr) =>
            arr.some((idx) => steps[idx]?.id === "assistencia")
        );
    }, [wizardStepIndexes, steps]);

    const isRestrito = typeof wizardRestrictGroup === "number";

    const requireAssistencia = useMemo(() => {
        if (assistenciaGroupIndex < 0) return false;
        if (!isRestrito) return true;
        return wizardRestrictGroup === assistenciaGroupIndex;
    }, [assistenciaGroupIndex, isRestrito, wizardRestrictGroup]);

    const grupoIndices = wizardStepIndexes[wizardStep] || [];
    const grupoSteps = useMemo(() => grupoIndices.map((i) => steps[i]), [grupoIndices, steps]);
    const assistenciaNoGrupoAtual = useMemo(
        () => grupoSteps.some((s) => s.id === "assistencia"),
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

    const bloqueiaPorAssistencia =
        requireAssistencia && assistenciaNoGrupoAtual && !isSimNao(assistenciaVal);

    // ✅ GPS p/ Local do Velório
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
                if (err?.code === 1) msg = "Permissão de localização negada.";
                if (err?.code === 2) msg = "Localização indisponível no momento (GPS sem sinal).";
                if (err?.code === 3) msg = "Tempo esgotado ao tentar obter localização.";
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

        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };

    const tentarConcluir = () => {
        if (wizardSubmitting) return;
        if (assistenciaNoGrupoAtual && !validarAssistencia()) return;
        concluirWizard();
    };

    const isRequired = (id: string) => obrigatorios.includes(id);

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Wizard" maxWidth={740}>
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

                    if (step.id === "urna" && step.type === "async_urna") {
                        return (
                            <div key={step.id}>
                                <UrnaCombobox
                                    label={step.label}
                                    required={isRequired(step.id)}
                                    placeholder={step.placeholder}
                                    initialValue={String((wizardData as any)[step.id] ?? "")}
                                    disabled={wizardSubmitting}
                                />
                            </div>
                        );
                    }

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
                                        Selecionar Materiais
                                    </button>
                                    <span className="text-sm text-muted-foreground">{arrumacaoSelecionadaResumo || "Nenhum item selecionado"}</span>
                                </div>
                                <input id="wizard-arrumacao" type="hidden" defaultValue="__custom__" />
                            </div>
                        );
                    }

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

                    // básicos
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
