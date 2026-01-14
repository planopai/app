"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";
import { API as API_ROOT } from "./constants";

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
   ✅ Grava meta da urna em inputs hidden:
      - wizard-urna_deposito_nome  (MEMORIAL|FUNERARIA)
      - wizard-urna_produto_id     (est_produto.id)
      - wizard-urna_codigo_barras  (codigo de barras)

   ✅ CORREÇÕES IMPORTANTES:
   1) NÃO limpar produto_id/cb no mount (useEffect(dep) roda no mount!)
      -> só limpa quando usuário troca depósito de verdade
   2) Validação externa (Wizard) vai bloquear salvar se urna preenchida e produto_id=0
========================= */
function UrnaCombobox({
    required,
    placeholder,
    initialValue,
    disabled,
    initialDepositoNome,
    initialProdutoId,
    initialCodigoBarras,
    errorText,
    onBlurValidate,
}: {
    required: boolean;
    placeholder?: string;
    initialValue: string;
    disabled?: boolean;

    // meta inicial (para edição)
    initialDepositoNome?: string;
    initialProdutoId?: number;
    initialCodigoBarras?: string;

    // validação/erro vindo do Wizard
    errorText?: string;
    onBlurValidate?: () => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizeDep = (v: any): "MEMORIAL" | "FUNERARIA" => {
        const s = String(v || "").trim().toUpperCase();
        return s === "FUNERARIA" ? "FUNERARIA" : "MEMORIAL";
    };

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState(initialValue || "");
    const [dep, setDep] = useState<"MEMORIAL" | "FUNERARIA">(normalizeDep(initialDepositoNome));
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<UrnaRow[]>([]);

    // hidden refs (meta)
    const depHiddenRef = useRef<HTMLInputElement>(null);
    const pidHiddenRef = useRef<HTMLInputElement>(null);
    const cbHiddenRef = useRef<HTMLInputElement>(null);

    // ✅ evita limpar produto no mount
    const didMountDepRef = useRef(false);

    function setHiddenMeta(next: { deposito_nome?: string; produto_id?: number; codigo_barras?: string }) {
        const depNome = normalizeDep(next.deposito_nome || dep);
        const pid = Number(next.produto_id || 0) || 0;
        const cb = (next.codigo_barras || "").toString().trim();

        if (depHiddenRef.current) depHiddenRef.current.value = depNome;
        if (pidHiddenRef.current) pidHiddenRef.current.value = pid > 0 ? String(pid) : "0";
        if (cbHiddenRef.current) cbHiddenRef.current.value = cb;
    }

    function clearProdutoMetaOnly() {
        if (pidHiddenRef.current) pidHiddenRef.current.value = "0";
        if (cbHiddenRef.current) cbHiddenRef.current.value = "";
    }

    // ✅ sincroniza quando abre/edita registro (carrega meta inicial!)
    useEffect(() => {
        const depInit = normalizeDep(initialDepositoNome);
        const pidInit = Number(initialProdutoId || 0) || 0;
        const cbInit = String(initialCodigoBarras || "").trim();

        setDep(depInit);
        setQ(initialValue || "");

        setRows([]);
        setErr("");
        setOpen(false);

        // preenche hidden com o que veio do banco (edição) ou defaults (novo)
        setHiddenMeta({ deposito_nome: depInit, produto_id: pidInit, codigo_barras: cbInit });

        // resetar marcador do dep-effect
        didMountDepRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValue, initialDepositoNome, initialProdutoId, initialCodigoBarras]);

    // ✅ ao mudar depósito:
    // - salva depósito no hidden
    // - limpa produto_id/cb SOMENTE se foi o usuário que mudou (não no mount)
    useEffect(() => {
        setHiddenMeta({ deposito_nome: dep });

        if (!didMountDepRef.current) {
            // primeira execução (mount) -> NÃO limpar
            didMountDepRef.current = true;
            return;
        }

        // usuário trocou depósito -> limpa pra evitar baixa errada
        clearProdutoMetaOnly();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dep]);

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
                url.searchParams.set("deposito_nome", dep);

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                const j = await r.json().catch(() => null);
                if (!j?.ok) throw new Error(j?.msg || "Falha ao buscar urnas");

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
    }, [q, open, dep]);

    return (
        <div ref={wrapRef}>
            {/* hidden metas (o page.tsx lê e envia pro PHP) */}
            <input ref={depHiddenRef} id="wizard-urna_deposito_nome" type="hidden" defaultValue={dep} />
            <input
                ref={pidHiddenRef}
                id="wizard-urna_produto_id"
                type="hidden"
                defaultValue={String(Number(initialProdutoId || 0) || 0)}
            />
            <input
                ref={cbHiddenRef}
                id="wizard-urna_codigo_barras"
                type="hidden"
                defaultValue={String(initialCodigoBarras || "")}
            />

            <div className="relative">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr] sm:gap-2">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Local da Urna</label>
                        <select
                            className="w-full rounded-md border px-2 py-2 text-sm disabled:opacity-60"
                            value={dep}
                            onChange={(e) => {
                                const next = normalizeDep(e.target.value);
                                setDep(next);
                                setRows([]);
                                setErr("");
                                setOpen(true);
                            }}
                            disabled={disabled}
                            title="Local da Urna"
                        >
                            <option value="MEMORIAL">MEMORIAL</option>
                            <option value="FUNERARIA">FUNERARIA</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                            Urna {required && <span className="text-red-600">*</span>}
                        </label>

                        <input
                            ref={inputRef}
                            id="wizard-urna"
                            type="text"
                            placeholder={placeholder || "Digite para buscar..."}
                            value={q}
                            onChange={(e) => {
                                setQ(e.target.value);
                                setOpen(true);

                                // digitou manualmente => limpa produto_id/cb (evita inconsistência)
                                clearProdutoMetaOnly();
                                setHiddenMeta({ deposito_nome: dep });
                            }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => {
                                // validação (Wizard)
                                onBlurValidate?.();
                            }}
                            className={`w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${errorText ? "border-red-500" : ""
                                }`}
                            disabled={disabled}
                            autoComplete="off"
                            title="Urna"
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
                            <div className="p-3 text-sm text-slate-600">Nenhuma urna encontrada no estoque ({dep}).</div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {rows.map((it) => (
                                    <li key={it.id}>
                                        <button
                                            type="button"
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setQ(it.nome);
                                                setHiddenMeta({
                                                    deposito_nome: dep,
                                                    produto_id: Number(it.id) || 0,
                                                    codigo_barras: it.codigo_barras || "",
                                                });

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

            <p className="mt-1 text-[11px] text-slate-400">
                Obs: a baixa de estoque acontece automaticamente ao registrar <b>Ínicio da Ornamentação (fase05)</b>.
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
    concluirWizard: () => Promise<void>; // ✅ CORREÇÃO: era void, mas no page.tsx é async

    wizardSubmitting: boolean;
}) {
    const [ornamentacaoVal, setOrnamentacaoVal] = useState<string>("");

    // ✅ erro específico da urna
    const [urnaErro, setUrnaErro] = useState<string>("");

    useEffect(() => {
        setOrnamentacaoVal(String((wizardData as any).ornamentacao ?? ""));
    }, [open, (wizardData as any).ornamentacao]);

    useEffect(() => {
        if (open) setUrnaErro("");
    }, [open]);

    const isSimNao = (v: string) => v === "Sim" || v === "Não";
    const [assistenciaErro, setAssistenciaErro] = useState<string>("");

    useEffect(() => {
        if (open) setAssistenciaErro("");
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

    // grupoSteps
    const grupoIndices = wizardStepIndexes[wizardStep] || [];
    const grupoSteps = useMemo(() => grupoIndices.map((i) => steps[i]), [grupoIndices, steps]);

    const assistenciaNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "assistencia"), [grupoSteps]);

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

    // ✅ valida urna: se campo preenchido (ou obrigatório) precisa ter produto_id > 0
    const validarUrnaSeNecessario = () => {
        // só valida se a urna está visível neste grupo (senão nem tem hidden no DOM)
        const urnaStepNoGrupo = grupoSteps.some((s) => s.id === "urna" && s.type === "async_urna");
        if (!urnaStepNoGrupo) return true;

        const urnaTxt = (document.getElementById("wizard-urna") as HTMLInputElement | null)?.value?.trim() ?? "";
        const pidStr = (document.getElementById("wizard-urna_produto_id") as HTMLInputElement | null)?.value?.trim() ?? "0";
        const pid = Number(pidStr) || 0;

        const isRequired = obrigatorios.includes("urna");

        // se obrigatório OU digitou algo, exige seleção válida
        if ((isRequired || urnaTxt !== "") && pid <= 0) {
            setUrnaErro("Selecione uma urna da lista (produto do estoque).");
            return false;
        }

        setUrnaErro("");
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

    const goNext = () => {
        if (wizardSubmitting) return;
        if (assistenciaNoGrupoAtual && !validarAssistencia()) return;
        if (!validarUrnaSeNecessario()) return;

        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };

    const tentarConcluir = async () => {
        if (wizardSubmitting) return;
        if (assistenciaNoGrupoAtual && !validarAssistencia()) return;
        if (!validarUrnaSeNecessario()) return;

        try {
            await concluirWizard();
        } catch (e: any) {
            // evita "Uncaught (in promise)"
            console.error("Falha ao concluir wizard:", e);
            alert(e?.message || "Erro ao salvar. Veja o console/Network.");
        }
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
                                    required={isRequired(step.id)}
                                    placeholder={step.placeholder}
                                    initialValue={String((wizardData as any)[step.id] ?? "")}
                                    disabled={wizardSubmitting}
                                    initialDepositoNome={String((wizardData as any).urna_deposito_nome ?? "MEMORIAL")}
                                    initialProdutoId={Number((wizardData as any).urna_produto_id ?? 0) || 0}
                                    initialCodigoBarras={String((wizardData as any).urna_codigo_barras ?? "")}
                                    errorText={urnaErro}
                                    onBlurValidate={validarUrnaSeNecessario}
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
                                    className={`w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${assistenciaErro ? "border-red-500" : ""
                                        }`}
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
