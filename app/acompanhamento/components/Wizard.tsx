"use client";

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
    | "async_urna"
    | "async_roupa"
    | "async_invol"
    | "async_veu"
    | "async_cordao";
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

const ESTOQUE_API = `${ENDPOINT}/materiais_gerais.php`;

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
   Combobox genérico (estoque)
   - action: "urnas_buscar" | "roupas_buscar" | "invols_buscar"
   - Usa deposito_nome e somente_com_saldo=1
   - ✅ AGORA: abre o modal já carregando a lista do depósito, sem precisar digitar
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
    const inputRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const [pickerOpen, setPickerOpen] = useState(false);

    // valor exibido no campo principal (e que o salvarGrupoWizard lê pelo DOM)
    const [value, setValue] = useState(initialValue || "");

    // busca dentro do modal (agora é opcional)
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const lastInitSigRef = useRef<string>("");

    // sincroniza quando abrir/editar registro
    useEffect(() => {
        const sig = `${String(initialValue || "")}||${String(depositoValue || "")}`;
        if (lastInitSigRef.current === sig) return;
        lastInitSigRef.current = sig;
        setValue(initialValue || "");
    }, [initialValue, depositoValue]);

    // ✅ ao abrir modal: limpa filtro, limpa erro e dispara carregamento da lista do depósito
    useEffect(() => {
        if (!pickerOpen) return;

        setErr("");
        setRows([]);
        setQ(""); // filtro opcional

        // 🔥 não focar teclado automaticamente (você quer clicar e escolher)
        // requestAnimationFrame(() => searchRef.current?.focus());
    }, [pickerOpen]);

    

    // ✅ busca async (dentro do modal)
    // Agora busca mesmo com q vazio (lista do depósito)
    useEffect(() => {
        if (!pickerOpen) return;

        const qq = q.trim();

        const ac = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            setErr("");

            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", action);

                // ✅ seu PHP já aceita q vazio (não filtra). Mantemos assim.
                url.searchParams.set("q", qq);

                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "60");
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
        }, 150);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [q, pickerOpen, action, depositoValue]);

    

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

        

        requestAnimationFrame(() => {
            searchRef.current?.blur();
            inputRef.current?.blur();
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
                            setRows([]);
                            setErr("");
                            // ✅ ao trocar depósito, já abre o modal pra escolher (sem digitar)
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
                            className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${errorText ? "border-red-500" : ""}`}

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

            <p className="mt-1 text-[11px] text-slate-500">
                Dica: selecione o <b>local</b> e toque em <b>Selecionar</b>. A lista já abre pronta.
            </p>

            {footerHint ? <div className="mt-1 text-[11px] text-slate-400">{footerHint}</div> : null}

            {/* MODAL / POPUP */}
            <Modal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                ariaLabel={`Selecionar ${label}`}
                maxWidth={720}
            >
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

                {/* ✅ busca opcional (se quiser filtrar). Se não digitar, lista já aparece */}
                <div className="mt-4 flex gap-2">
                    <input
                        ref={searchRef}
                        type="text"
                        value={q}
                        onChange={(e) => {
                            const v = e.target.value;
                            setQ(v);
                            setErr("");
                            // NÃO mexe na eleção 
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
                        <div className="p-3 text-base text-slate-600">
                            Nenhum item encontrado no estoque ({depositoValue}).
                        </div>
                    ) : (
                        <ul className="max-h-[65vh] overflow-auto py-1">
                            {rows.map((it) => {
                                const pidKey = getPidFromRow(it);
                                return (
                                    <li key={pidKey || it.nome}>
                                        <button
                                            type="button"
                                            className="w-full px-3 py-3 text-left text-base hover:bg-slate-50"
                                            onClick={() => applySelection(it)}
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

                <div className="mt-3 text-[11px] text-slate-500">
                    Toque no item para selecionar. (Sem digitar, a lista já vem do depósito.)
                </div>
            </Modal>
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
    const [veuVal, setVeuVal] = useState<string>("");
    const [cordaoVal, setCordaoVal] = useState<string>("");


    const [assistenciaErro, setAssistenciaErro] = useState<string>("");
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

    // ✅ erro do tipo (Natural/Artificial) quando ornamentacao = Sim
    const [ornamentacaoTipoErro, setOrnamentacaoTipoErro] = useState<string>("");




    // depósitos locais (controlados)
    const [depUrna, setDepUrna] = useState<DepUrna>("MEMORIAL");
    const [depRoupa, setDepRoupa] = useState<DepRoupa>("ARMARIO SANDRO");
    const [depInvol, setDepInvol] = useState<DepInvol>("ARMARIO SANDRO");
    const [depVeu, setDepVeu] = useState<DepVeu>("ARMARIO SANDRO");
    const [depCordao, setDepCordao] = useState<DepCordao>("ARMARIO SANDRO");


    useEffect(() => {
        setOrnamentacaoVal(String((wizardData as any).ornamentacao ?? ""));
        setInvolVal(String((wizardData as any).invol ?? ""));
        setVeuVal(String((wizardData as any).veu ?? ""));
        setCordaoVal(String((wizardData as any).cordao ?? ""));
    }, [
        open,
        (wizardData as any).ornamentacao,
        (wizardData as any).invol,
        (wizardData as any).veu,
        (wizardData as any).cordao,
    ]);


    useEffect(() => {
        if (!open) return;

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



    // ✅ limpa erro URNA quando a seleção (produto_id) chega no wizardData
    useEffect(() => {
        if (!open) return;

        const urnaTxt = String((wizardData as any).urna ?? "").trim();
        const pid = Number((wizardData as any).urna_produto_id ?? 0) || 0;

        // se já tem produto selecionado (ou o campo está vazio), não faz sentido manter erro
        if (pid > 0 || urnaTxt === "") setUrnaErro("");
    }, [open, (wizardData as any).urna, (wizardData as any).urna_produto_id]);

    // ✅ limpa erro INVOL quando invol != Sim, ou quando produto/depósito chegam
    useEffect(() => {
        if (!open) return;

        const invol = String((wizardData as any).invol ?? involVal ?? "");

        if (invol !== "Sim") {
            // se não é Sim, não deve exigir INVOL do estoque
            setInvolErro("");
            return;
        }

        const pid = Number((wizardData as any).invol_produto_id ?? 0) || 0;
        const dep = String((wizardData as any).invol_deposito_nome ?? "").trim();

        if (pid > 0 && dep) setInvolErro("");
    }, [
        open,
        involVal,
        (wizardData as any).invol,
        (wizardData as any).invol_produto_id,
        (wizardData as any).invol_deposito_nome,
    ]);

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
    }, [
        open,
        veuVal,
        (wizardData as any).veu,
        (wizardData as any).veu_produto_id,
        (wizardData as any).veu_deposito_nome,
    ]);

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
    }, [
        open,
        cordaoVal,
        (wizardData as any).cordao,
        (wizardData as any).cordao_produto_id,
        (wizardData as any).cordao_deposito_nome,
    ]);



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
    const veuNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu"), [grupoSteps]);
    const veuItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu_item"), [grupoSteps]);
    const cordaoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao"), [grupoSteps]);
    const cordaoItemNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao_item"), [grupoSteps]);
    const tanatoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "tanato"), [grupoSteps]);
    const ornamentacaoNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "ornamentacao"), [grupoSteps]);
    const involSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "invol"), [grupoSteps]);
    const veuSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "veu"), [grupoSteps]);
    const cordaoSelectNoGrupoAtual = useMemo(() => grupoSteps.some((s) => s.id === "cordao"), [grupoSteps]);



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

    // ✅ validações "Sim/Não" para selects obrigatórios
    const validarTanatoSelect = () => {
        if (!tanatoNoGrupoAtual) return true;           // ✅ só valida se está na tela
        if (!isRequired("tanato")) return true;

        if (isSimNao(tanatoVal)) {
            setTanatoSelectErro("");
            return true;
        }
        setTanatoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };


    const validarOrnamentacaoSelect = () => {
        if (!ornamentacaoNoGrupoAtual) return true;     // ✅
        if (!isRequired("ornamentacao")) return true;

        if (isSimNao(ornamentacaoVal)) {
            setOrnamentacaoSelectErro("");
            return true;
        }
        setOrnamentacaoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };


    const validarInvolSelect = () => {
        if (!involSelectNoGrupoAtual) return true;      // ✅
        if (!isRequired("invol")) return true;

        if (isSimNao(involVal)) {
            setInvolSelectErro("");
            return true;
        }
        setInvolSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarVeuSelect = () => {
        if (!veuSelectNoGrupoAtual) return true;        // ✅
        if (!isRequired("veu")) return true;

        if (isSimNao(veuVal)) {
            setVeuSelectErro("");
            return true;
        }
        setVeuSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    const validarCordaoSelect = () => {
        if (!cordaoSelectNoGrupoAtual) return true;     // ✅
        if (!isRequired("cordao")) return true;

        if (isSimNao(cordaoVal)) {
            setCordaoSelectErro("");
            return true;
        }
        setCordaoSelectErro('Selecione "Sim" ou "Não".');
        return false;
    };

    // ✅ se ornamentacao = Sim, exige Natural/Artificial (ornamentacao_tipo)
    const validarOrnamentacaoTipoSeNecessario = () => {
        // Só valida se o campo existe no grupo atual (ou seja, está renderizando agora)
        const tipoNoGrupoAtual = grupoSteps.some((s) => s.id === "ornamentacao_tipo");
        if (!tipoNoGrupoAtual) return true;

        // Só obriga se Ornamentação = Sim
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

    // ✅ valida ROUPA pelo wizardData
    const validarRoupaSeNecessario = () => {
        if (!roupaNoGrupoAtual) return true;

        const roupaTxt = String((wizardData as any).roupa ?? "").trim();
        const req = isRequired("roupa");

        if (!req && roupaTxt === "") {
            setRoupaErro("");
            return true;
        }

        if (roupaTxt !== "" && isRoupaPropria(roupaTxt)) {
            setRoupaErro("");
            return true;
        }

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

    const validarVeuSeNecessario = () => {
        if (!veuNoGrupoAtual && !veuItemNoGrupoAtual) return true;

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

    const validarCordaoSeNecessario = () => {
        if (!cordaoNoGrupoAtual && !cordaoItemNoGrupoAtual) return true;

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
        // pega o primeiro campo "marcado" como erro
        const el =
            (document.querySelector('[data-wizard-error="1"]') as HTMLElement | null) ||
            (document.querySelector(".border-red-500") as HTMLElement | null);

        if (!el) return;

        // rola suavemente pra ele (bom no celular)
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        // tenta focar (select/input)
        requestAnimationFrame(() => {
            (el as any)?.focus?.();
        });
    };

    
    const goNext = () => {
        if (wizardSubmitting) return;

        // Assistência (já existia)
        if (assistenciaNoGrupoAtual && !validarAssistencia()) { scrollToFirstError(); return; }

        if (!validarTanatoSelect()) { scrollToFirstError(); return; }
        if (!validarOrnamentacaoSelect()) { scrollToFirstError(); return; }
        if (!validarOrnamentacaoTipoSeNecessario()) { scrollToFirstError(); return; }
        if (!validarInvolSelect()) { scrollToFirstError(); return; }
        if (!validarVeuSelect()) { scrollToFirstError(); return; }
        if (!validarCordaoSelect()) { scrollToFirstError(); return; }

        if (!validarUrnaSeNecessario()) { scrollToFirstError(); return; }
        if (!validarRoupaSeNecessario()) { scrollToFirstError(); return; }
        if (!validarVeuSeNecessario()) { scrollToFirstError(); return; }
        if (!validarCordaoSeNecessario()) { scrollToFirstError(); return; }
        if (!validarInvolSeNecessario()) { scrollToFirstError(); return; }



        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };


    const tentarConcluir = async () => {
        if (wizardSubmitting) return;

        if (assistenciaNoGrupoAtual && !validarAssistencia()) { scrollToFirstError(); return; }

        if (!validarTanatoSelect()) { scrollToFirstError(); return; }
        if (!validarOrnamentacaoSelect()) { scrollToFirstError(); return; }
        if (!validarOrnamentacaoTipoSeNecessario()) { scrollToFirstError(); return; }

        if (!validarInvolSelect()) { scrollToFirstError(); return; }
        if (!validarVeuSelect()) { scrollToFirstError(); return; }
        if (!validarCordaoSelect()) { scrollToFirstError(); return; }

        if (!validarUrnaSeNecessario()) { scrollToFirstError(); return; }
        if (!validarRoupaSeNecessario()) { scrollToFirstError(); return; }
        if (!validarVeuSeNecessario()) { scrollToFirstError(); return; }
        if (!validarCordaoSeNecessario()) { scrollToFirstError(); return; }
        if (!validarInvolSeNecessario()) { scrollToFirstError(); return; }

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

                                        setUrnaErro(""); // pronto, some na hora
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
                       ROUPA (async + ROUPA PRÓPRIA)
                       =========================== */
                    if (step.type === "async_roupa" && step.id === "roupa") {
                        const roupaAtual = String((wizardData as any).roupa ?? "");
                        const isPropria = isRoupaPropria(roupaAtual);

                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <EstoqueCombobox
                                    inputId="wizard-roupa"
                                    label="Roupa"
                                    required={isRequired(step.id)}
                                    placeholder={step.placeholder || 'Selecione no estoque ou use "ROUPA PRÓPRIA"'}
                                    initialValue={String((wizardData as any).roupa ?? "")}
                                    disabled={wizardSubmitting}
                                    depositoLabel="Local da Roupa:"
                                    depositoOptions={[
                                        { value: "ARMARIO SANDRO", label: "ARMARIO SANDRO" },
                                        { value: "ARMARIO ILDO", label: "ARMARIO ILDO" },
                                        { value: "FUNERARIA", label: "FUNERARIA" },
                                    ]}
                                    depositoValue={depRoupa}
                                    onChangeDeposito={(v) => {
                                        const next = normalizeDepRoupa(v);
                                        setDepRoupa(next);

                                        // se for roupa própria, depósito não importa
                                        if (isRoupaPropria((wizardData as any).roupa)) return;

                                        // ✅ ao trocar depósito, limpa a seleção para não ficar "nome sem produto_id"
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
                                        }));
                                    }}
                                    extraButtons={
                                        <>
                                            <button
                                                type="button"
                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                                disabled={wizardSubmitting}
                                                onClick={() => {
                                                    // 1) Atualiza o state (wizardData)
                                                    setWizardData((prev: any) => ({
                                                        ...prev,
                                                        roupa: "ROUPA PRÓPRIA",
                                                        roupa_deposito_nome: "",
                                                        roupa_produto_id: 0,
                                                        roupa_codigo_barras: "",
                                                        // opcional (não quebra o PHP; ajuda debug/controle no futuro)
                                                        roupa_propria: 1,
                                                    }));

                                                    // 2) Força o valor no input do DOM (caso salvarGrupoWizard leia do DOM)
                                                    const el = document.getElementById("wizard-roupa") as HTMLInputElement | null;
                                                    if (el) {
                                                        el.value = "ROUPA PRÓPRIA";
                                                        // dispara eventos para quem estiver escutando input/change
                                                        el.dispatchEvent(new Event("input", { bubbles: true }));
                                                        el.dispatchEvent(new Event("change", { bubbles: true }));
                                                        el.blur();
                                                    }

                                                    // 3) Limpa erro e valida em seguida (garante que o próximo clique não bloqueie)
                                                    setRoupaErro("");
                                                    requestAnimationFrame(() => validarRoupaSeNecessario());
                                                }}
                                            >
                                                Usar ROUPA PRÓPRIA
                                            </button>


                                            {isPropria ? (
                                                <span className="text-[11px] text-slate-500 self-center">Roupa própria não usa estoque.</span>
                                            ) : null}
                                        </>
                                    }
                                />
                            </div>
                        );
                    }

                    /* ===========================
   VÉU (select controlado)
   =========================== */
                    if (step.id === "veu" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>

                                <select
                                    id={`wizard-${step.id}`}
                                    data-wizard-error={veuSelectErro || veuErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${veuSelectErro || veuErro ? "border-red-500" : ""}`}
                                    value={veuVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setVeuVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            veu: v,
                                            ...(v !== "Sim"
                                                ? { veu_deposito_nome: "", veu_produto_id: 0, veu_codigo_barras: "", veu_item: "" }
                                                : {}),
                                        }));

                                        if (isSimNao(v)) setVeuSelectErro("");
                                        if (v !== "Sim") setVeuErro(""); // mantém seu erro de estoque limpo
                                    }}
                                    onBlur={() => validarVeuSelect()}
                                    disabled={wizardSubmitting}
                                >

                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}

                                </select>
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
                                    required={true}
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
                                            veu: "Sim", // ✅ garante coerência
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
   CORDÃO (select controlado)
   =========================== */
                    if (step.id === "cordao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>

                                <select
                                    id={`wizard-${step.id}`}
                                    data-wizard-error={cordaoSelectErro || cordaoErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${cordaoSelectErro || cordaoErro ? "border-red-500" : ""}`}
                                    value={cordaoVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCordaoVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            cordao: v,
                                            ...(v !== "Sim"
                                                ? { cordao_deposito_nome: "", cordao_produto_id: 0, cordao_codigo_barras: "", cordao_item: "" }
                                                : {}),
                                        }));

                                        if (isSimNao(v)) setCordaoSelectErro("");
                                        if (v !== "Sim") setCordaoErro(""); // mantém seu erro de estoque limpo
                                    }}
                                    onBlur={() => validarCordaoSelect()}
                                    disabled={wizardSubmitting}
                                >

                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}

                                </select>
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
                                    required={true}
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
                                            cordao: "Sim", // ✅ garante coerência
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
                                    data-wizard-error={assistenciaErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${assistenciaErro ? "border-red-500" : ""}`}

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
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
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
                                    data-wizard-error={tanatoSelectErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${tanatoSelectErro ? "border-red-500" : ""}`}
                                    value={tanatoVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setTanatoVal(v);
                                        setWizardData((prev: any) => ({ ...prev, tanato: v }));
                                        if (isSimNao(v)) setTanatoSelectErro("");
                                    }}
                                    onBlur={() => validarTanatoSelect()}
                                    disabled={wizardSubmitting}
                                >
                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}

                                </select>

                                {tanatoSelectErro && <div className="mt-1 text-xs text-red-600">{tanatoSelectErro}</div>}
                            </div>
                        );
                    }


                    /* ===========================
                       ornamentacao (controlado)
                       =========================== */
                    if (step.id === "ornamentacao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>


                                <select
                                    id={`wizard-${step.id}`}
                                    data-wizard-error={ornamentacaoSelectErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${ornamentacaoSelectErro ? "border-red-500" : ""}`}
                                    value={ornamentacaoVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setOrnamentacaoVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            ornamentacao: v,
                                            ...(v !== "Sim" ? { ornamentacao_tipo: "" } : {}),
                                        }));

                                        if (isSimNao(v)) setOrnamentacaoSelectErro("");
                                    }}
                                    onBlur={() => validarOrnamentacaoSelect()}
                                    disabled={wizardSubmitting}
                                >
                                    


                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}

                                </select>
                                {ornamentacaoSelectErro && <div className="mt-1 text-xs text-red-600">{ornamentacaoSelectErro}</div>}
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
                                    data-wizard-error={involSelectErro || involErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${involSelectErro ? "border-red-500" : ""}`}
                                    value={involVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setInvolVal(v);

                                        setWizardData((prev: any) => ({
                                            ...prev,
                                            invol: v,
                                            ...(v !== "Sim" ? { invol_deposito_nome: "", invol_produto_id: 0, invol_codigo_barras: "", invol_item: "" } : {}),
                                        }));

                                        if (isSimNao(v)) setInvolSelectErro("");
                                        if (v !== "Sim") setInvolErro(""); // mantém seu erro de estoque limpo
                                    }}
                                    onBlur={() => validarInvolSelect()}
                                    disabled={wizardSubmitting}
                                >
                                    


                                    <option value="" disabled>
                                        Selecione…
                                    </option>
                                    {["Sim", "Não"].map((op) => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}

                                </select>
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
                                    required={true}
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

                                        // some na hora (sem revalidar cedo demais)
                                        setInvolErro("");
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
                                    id={`wizard-${step.id}`}
                                    data-wizard-error={ornamentacaoTipoErro ? "1" : "0"}
                                    className={`w-full rounded-md border px-3 py-2 text-base disabled:opacity-60 ${ornamentacaoTipoErro ? "border-red-500" : ""
                                        }`}
                                    value={String((wizardData as any).ornamentacao_tipo ?? "")}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setWizardData((prev: any) => ({ ...prev, ornamentacao_tipo: v }));
                                        if (v) setOrnamentacaoTipoErro("");
                                    }}
                                    onBlur={() => validarOrnamentacaoTipoSeNecessario()}
                                    disabled={wizardSubmitting}
                                >
                                    <option value="" disabled>
                                        Selecione…
                                    </option>

                                    {(step.options || ["Natural", "Artificial"]).filter(Boolean).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>

                                {ornamentacaoTipoErro && (
                                    <div className="mt-1 text-xs text-red-600">{ornamentacaoTipoErro}</div>
                                )}
                            </div>
                        );
                    }



                    /* ===========================
                       defaults
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
                        const options = (step.options && step.options.length > 0)
                            ? step.options
                            : ["Sim", "Não"]; // fallback só se não vier opções

                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>

                                <select
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
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <input
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
