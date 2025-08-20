"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

/* -----------------------------------------------------------
   Tipos
----------------------------------------------------------- */

type MaterialKey =
    | "cadeiras"
    | "bebedouros"
    | "suporte_coroa"
    | "kit_lanche"
    | "velas"
    | "tenda"
    | "placa"
    | "paramentacao";

type MateriaisState = Record<
    MaterialKey,
    {
        checked: boolean;
        qtd: number;
    }
>;

type ArrumacaoState = {
    luvas: boolean;
    palha: boolean;
    tamponamento: boolean; // grafia “Tanponamento” no pedido; padronizei como “tamponamento”
    maquiagem: boolean;
    algodao: boolean;
    cordao: boolean;
    barba: boolean;
};

type Registro = {
    id?: number | string;
    status?: string; // fase01..fase11
    falecido?: string;
    agente?: string;
    contato?: string;
    religiao?: string;
    convenio?: string;
    urna?: string;
    roupa?: string;
    assistencia?: string; // "Sim" | "Não"
    tanato?: string; // "Sim" | "Não"
    local?: string;
    local_velorio?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_inicio_velorio?: string;
    hora_fim_velorio?: string;

    // Observações (uma por etapa, nenhuma obrigatória)
    observacao_atendimento?: string;
    observacao_itens?: string;
    observacao_velorio01?: string;
    observacao_velorio02?: string;

    // Persistência de materiais/arrumação
    materiais_json?: string;
    materiais_cadeiras_qtd?: string | number;
    materiais_bebedouros_qtd?: string | number;
    // (novos campos de quantidade – serão adicionados no back e DB)
    materiais_suporte_coroa_qtd?: string | number;
    materiais_kit_lanche_qtd?: string | number;
    materiais_velas_qtd?: string | number;
    materiais_tenda_qtd?: string | number;
    materiais_placa_qtd?: string | number;
    materiais_paramentacao_qtd?: string | number;

    arrumacao_json?: string;

    // Para manter no estado do wizard
    materiais?: MateriaisState;
    arrumacao?: ArrumacaoState;

    [k: string]: any;
};

type Aviso = {
    id: number | string;
    usuario: string;
    mensagem: string;
    criado_em: string;
    finalizado?: number;
};

/* -----------------------------------------------------------
   Constantes / helpers
----------------------------------------------------------- */

const wizardStepTitles = ["Atendimento", "Itens", "Velório 01", "Velório 02"];

/**
 * Índices dos campos (array steps) usados por etapa.
 * Obs: ao final de cada grupo existe a observação correspondente.
 */
const wizardStepIndexes = [
    [0, 1, 2, 3, 14], // Atendimento: falecido, contato, religiao, convenio, observacao_atendimento
    [4, 5, 6, 7, 15], // Itens: urna, roupa, assistencia, tanato, observacao_itens
    [8, 9, 10, 16], // Velório 01: local, local_velorio, data_inicio_velorio, observacao_velorio01
    [11, 12, 13, 17], // Velório 02: data_fim_velorio, hora_inicio_velorio, hora_fim_velorio, observacao_velorio02
];

const steps = [
    { label: "Nome do Falecido(a)", id: "falecido", type: "input", placeholder: "Digite o nome" }, // 0
    { label: "Contato", id: "contato", type: "input", placeholder: "Contato/telefone" }, // 1
    {
        label: "Religião",
        id: "religiao",
        type: "select",
        options: ["", "Evangélico", "Católico", "Espirita", "Ateu", "Outras", "Não Informado"],
    }, // 2
    {
        label: "Convênio",
        id: "convenio",
        type: "select",
        options: ["", "Particular", "Prefeitura de Barreiras", "Prefeitura de Angical", "Prefeitura de São Desidério", "Associado(a)"],
    }, // 3
    { label: "Urna", id: "urna", type: "input", placeholder: "Digite o Modelo Da Urna" }, // 4
    {
        label: "Roupa",
        id: "roupa",
        type: "select",
        options: [
            "ROUPA PRÓPRIA",
            "CONJ. MASCULINO - RENASCER",
            "LA BELLE CINZA - NORMAL",
            "CONJ. MASCULINO - RENASCER",
            "CONJ. FEMININO - RENASCER",
            "CONJ. MASCULINO GG",
            "CONJ. FEMININO GG",
            "CONJ. MASCULINO INFANTIL TAM P",
            "CONJ. MASCULINO INFANTIL TAM M",
            "CONJ, MASCULINO INFANTIL TAM G",
            "CONJ. FEMININO INFANTIL TAM P",
            "CONJ. FEMININO INFANTIL TAM M",
            "CONJ. FEMININO INFANTIL TAM G",
        ],
    }, // 5
    { label: "Assistência", id: "assistencia", type: "select", options: ["", "Sim", "Não"] }, // 6
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] }, // 7
    {
        label: "Local do Sepultamento",
        id: "local",
        type: "datalist",
        placeholder: "Digite ou escolha",
        datalist: [
            "Cemitério São João Batista",
            "Cemitério São Sebastião",
            "Cemitério Jardim da Saudade",
            "Cemitério de São Desiderio",
            "Cemitério de Angical",
            "Cemitério de Richão Das Neves",
        ],
    }, // 8
    {
        label: "Local do Velório",
        id: "local_velorio",
        type: "datalist",
        placeholder: "Digite ou escolha",
        datalist: ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"],
    }, // 9
    { label: "Data de Início do Velório", id: "data_inicio_velorio", type: "date" }, // 10
    { label: "Data de Fim do Velório", id: "data_fim_velorio", type: "date" }, // 11
    { label: "Hora de Início do Velório", id: "hora_inicio_velorio", type: "time" }, // 12
    { label: "Hora de Fim do Velório", id: "hora_fim_velorio", type: "time" }, // 13

    // Novas observações específicas por etapa
    { label: "Observações do Atendimento", id: "observacao_atendimento", type: "textarea", placeholder: "Digite observações do atendimento (opcional)" }, // 14
    { label: "Observações de Itens", id: "observacao_itens", type: "textarea", placeholder: "Digite observações de itens (opcional)" }, // 15
    { label: "Observações do Velório 01", id: "observacao_velorio01", type: "textarea", placeholder: "Digite observações do velório 01 (opcional)" }, // 16
    { label: "Observações do Velório 02", id: "observacao_velorio02", type: "textarea", placeholder: "Digite observações do velório 02 (opcional)" }, // 17
] as const;

const obrigatorios = ["falecido", "contato", "convenio", "religiao", "urna"];
const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

// 11 fases (a 11ª é Material Recolhido)
const fases = [
    "fase01",
    "fase02",
    "fase03",
    "fase04",
    "fase05",
    "fase06",
    "fase07",
    "fase08",
    "fase09",
    "fase10",
    "fase11",
] as const;

/** URL ABSOLUTA DO LOGIN (fix) */
const LOGIN_ABSOLUTE = "https://pai.planoassistencialintegrado.com.br/login";

/** URL ABSOLUTA DO BACKEND (fix) */
const API = "https://pai.planoassistencialintegrado.com.br";

/** Evita múltiplos redirecionamentos/alerts (fix) */
let IS_REDIRECTING = false;

// Config de materiais (para DRY)
const materiaisConfig: { key: MaterialKey; label: string }[] = [
    { key: "cadeiras", label: "Cadeiras" },
    { key: "bebedouros", label: "Bebedouros" },
    { key: "suporte_coroa", label: "Suporte para Coroa" },
    { key: "kit_lanche", label: "Kit Lanche" },
    { key: "velas", label: "Velas" },
    { key: "tenda", label: "Tenda" },
    { key: "placa", label: "Placa" },
    { key: "paramentacao", label: "Paramentação" },
];

function defaultMateriais(): MateriaisState {
    return materiaisConfig.reduce((acc, m) => {
        acc[m.key] = { checked: false, qtd: 0 };
        return acc;
    }, {} as MateriaisState);
}

function defaultArrumacao(): ArrumacaoState {
    return {
        luvas: false,
        palha: false,
        tamponamento: false,
        maquiagem: false,
        algodao: false,
        cordao: false,
        barba: false,
    };
}

// Redireciona para login exibindo a mensagem
function redirectToLogin(loginUrl?: string, msg?: string) {
    if (IS_REDIRECTING) return;
    IS_REDIRECTING = true;
    try {
        if (msg) alert(msg);
    } catch { }
    const url =
        (loginUrl && /^https?:\/\//i.test(loginUrl) && loginUrl) || LOGIN_ABSOLUTE;
    // replace não cria histórico; href como fallback imediato
    try {
        window.location.replace(url);
        setTimeout(() => {
            // fallback para navegadores que ignorarem o replace
            if (typeof window !== "undefined" && window.location.href !== url) {
                window.location.href = url;
            }
        }, 50);
    } catch {
        window.location.href = url;
    }
}

// Helper fetch + tratamento de 401/need_login
async function jsonWith401(url: string, init?: RequestInit) {
    const resp = await fetch(url, { credentials: "include", ...init });

    // Redireciona imediatamente em 401, mesmo que a resposta não seja JSON
    if (resp.status === 401) {
        redirectToLogin(undefined, "Sessão expirada. Faça login novamente.");
        throw new Error("Sessão expirada.");
    }

    let data: any = null;
    try {
        data = await resp.json();
    } catch {
        // se não for JSON e não for ok, ainda assim sinaliza erro
        if (!resp.ok) {
            throw new Error("Falha na requisição.");
        }
    }

    // Sessão expirada padronizada pelo backend
    if (data?.need_login) {
        redirectToLogin(
            data?.login_url,
            data?.msg || "Sessão expirada. Faça login novamente."
        );
        throw new Error(data?.msg || "Sessão expirada.");
    }

    if (!resp.ok || data?.erro) {
        const msg = data?.msg || "Falha na requisição.";
        throw new Error(msg);
    }

    return data;
}

function capitalizeStatus(s?: string) {
    switch (s) {
        case "fase01":
            return "Removendo";
        case "fase02":
            return "Aguardando Procedimento";
        case "fase03":
            return "Preparando";
        case "fase04":
            return "Aguardando Ornamentação";
        case "fase05":
            return "Ornamentando";
        case "fase06":
            return "Corpo Pronto";
        case "fase07":
            return "Transportando";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Sepultando";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return "Aguardando";
    }
}

function acaoToStatus(acao: string) {
    const map: Record<string, string> = {
        fase01: "Indo Retirar o Óbito",
        fase02: "Corpo na Clínica",
        fase03: "Ínicio de Conservação",
        fase04: "Fim da Conservação",
        fase05: "Ínicio da Ornamentação",
        fase06: "Fim da Ornamentação",
        fase07: "Transportando Óbito P/Velório",
        fase08: "Entrega de Corpo",
        fase09: "Transportando P/ Sepultamento",
        fase10: "Sepultamento Concluído",
        fase11: "Material Recolhido",
    };
    return map[acao] ?? "fase01";
}

function isTanatoNo(v?: string) {
    if (!v) return false;
    const s = v.trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

/* -----------------------------------------------------------
   Componentes auxiliares
----------------------------------------------------------- */

function Modal({
    open,
    onClose,
    children,
    ariaLabel,
    maxWidth,
}: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel: string;
    maxWidth?: number;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full rounded-xl bg-white p-5 shadow-xl outline-none"
                style={{ maxWidth: maxWidth ?? 720 }}
            >
                {children}
            </div>
        </div>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="mb-1 block text-sm font-medium">{children}</label>;
}

function TextFeedback({
    kind,
    children,
}: {
    kind: "success" | "error";
    children?: React.ReactNode;
}) {
    if (!children) return null;
    return (
        <div
            className={`mt-3 rounded-md px-3 py-2 text-sm ${kind === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
        >
            {children}
        </div>
    );
}

/* -----------------------------------------------------------
   Página
----------------------------------------------------------- */

export default function AcompanhamentoPage() {
    // Tabela
    const [registros, setRegistros] = useState<Registro[]>([]);

    // Avisos
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(
        null
    );
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // Wizard
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardTitle, setWizardTitle] = useState("Novo Registro");
    const [wizardEditing, setWizardEditing] = useState(false);
    const [wizardIdx, setWizardIdx] = useState<number | null>(null);
    const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(
        null
    );
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState<Registro>({});

    const [wizardMsg, setWizardMsg] = useState<{ text: string; ok: boolean } | null>(
        null
    );

    // para controlar os selects que mudam UI (assistencia/tanato)
    const [assistenciaVal, setAssistenciaVal] = useState<string>("");
    const [tanatoVal, setTanatoVal] = useState<string>("");

    // Materiais
    const [materiaisOpen, setMateriaisOpen] = useState(false);
    const [materiais, setMateriais] = useState<MateriaisState>(defaultMateriais());

    // Arrumação do corpo
    const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
    const [arrumacao, setArrumacao] = useState<ArrumacaoState>(defaultArrumacao());

    // Ações
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoIdx, setAcaoIdx] = useState<number | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(
        null
    );
    const [acaoSubmitting, setAcaoSubmitting] = useState(false);

    // Info Etapas
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoIdx, setInfoIdx] = useState<number | null>(null);

    /* -------------------- Fetch helpers -------------------- */

    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(
                `${API}/api/php/informativo.php?listar=1&_nocache=${Date.now()}`,
                {
                    cache: "no-store",
                    headers: {
                        Pragma: "no-cache",
                        Expires: "0",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                    },
                    credentials: "include",
                }
            );

            // Redirect imediato em 401, mesmo sem JSON
            if (r.status === 401) {
                redirectToLogin(undefined, "Sessão expirada. Faça login novamente.");
                return;
            }

            // tenta ler JSON (pode não ser JSON)
            const data = await r.json().catch(() => null);
            if (data?.need_login) {
                redirectToLogin(
                    data?.login_url,
                    data?.msg || "Sessão expirada. Faça login novamente."
                );
                return;
            }
            setRegistros(Array.isArray(data) ? data : []);
        } catch {
            setRegistros([]);
        }
    }, []);

    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(
                `${API}/api/php/avisos.php?listar=1&_nocache=${Date.now()}`,
                { credentials: "include" }
            );
            if (r.status === 401) {
                redirectToLogin(undefined, "Sessão expirada. Faça login novamente.");
                return;
            }
            const data = await r.json().catch(() => null);
            if (data?.need_login) {
                redirectToLogin(
                    data?.login_url,
                    data?.msg || "Sessão expirada. Faça login novamente."
                );
                return;
            }
            setAvisos(Array.isArray(data) ? data : []);
        } catch {
            setAvisos([]);
        }
    }, []);

    const enviarRegistroPHP = useCallback((data: any) => {
        // achata materiais e arrumação
        let materiais_json = "";
        // campos “_qtd” para persistirmos separadamente (compat + novos)
        const flatQtd: Record<string, string> = {};

        if (data.materiais) {
            materiais_json = JSON.stringify(data.materiais);

            // Preenche dinamicamente os campos *_qtd conforme selecionados
            materiaisConfig.forEach((m) => {
                const q = Number(data.materiais?.[m.key]?.qtd ?? 0);
                const c = !!data.materiais?.[m.key]?.checked;
                const col = `materiais_${m.key}_qtd`;
                if (c && q > 0) flatQtd[col] = String(q);
                else flatQtd[col] = ""; // envia vazio para limpar
            });
        }

        // Arrumação do corpo (somente flags)
        let arrumacao_json = "";
        if (data.arrumacao) {
            arrumacao_json = JSON.stringify(data.arrumacao);
        }

        const body = {
            ...data, // mantém id em edição
            local: data.local || "",
            materiais_json,
            arrumacao_json,
            // espalha todos os *_qtd (inclui cadeiras/bebedouros e os novos)
            ...flatQtd,
        };

        return jsonWith401(`${API}/api/php/informativo.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }, []);

    /* -------------------- Ciclos -------------------- */

    useEffect(() => {
        fetchRegistros();
        fetchAvisos();
        const intReg = setInterval(fetchRegistros, 10000);
        const intAv = setInterval(fetchAvisos, 3000);
        const onVis = () => {
            if (!document.hidden) fetchRegistros();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            clearInterval(intReg);
            clearInterval(intAv);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [fetchRegistros, fetchAvisos]);

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setWizardOpen(false);
                setAcaoOpen(false);
                setInfoOpen(false);
                setMateriaisOpen(false);
                setArrumacaoOpen(false);
            }
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, []);

    /* -------------------- Tabela -------------------- */
    // agora só some quando chegar em fase11 (backend já filtra por material_recolhido=0)
    const registrosVisiveis = useMemo(
        () => registros.filter((r) => r.status !== "fase11"),
        [registros]
    );

    /* -------------------- Wizard -------------------- */

    const parseMateriaisFromRegistro = (r: Registro): MateriaisState => {
        // Primeiro tenta materiais_json
        if (r.materiais_json) {
            try {
                const parsed = JSON.parse(String(r.materiais_json));
                // funde com possíveis colunas *_qtd
                const base = defaultMateriais();
                materiaisConfig.forEach((m) => {
                    const qtdCol = (r as any)[`materiais_${m.key}_qtd`];
                    const parsedItem = parsed?.[m.key];
                    base[m.key] = {
                        checked:
                            !!parsedItem?.checked || Number(qtdCol) > 0 || !!parsedItem?.qtd,
                        qtd: Number(parsedItem?.qtd ?? (qtdCol != null ? qtdCol : 0)),
                    };
                });
                return base;
            } catch {
                // segue fallback
            }
        }

        // Fallback: monta a partir das colunas *_qtd já existentes
        const base = defaultMateriais();
        materiaisConfig.forEach((m) => {
            const qtdCol = (r as any)[`materiais_${m.key}_qtd`];
            const qtd = Number(qtdCol ?? 0);
            base[m.key] = { checked: qtd > 0, qtd };
        });
        return base;
    };

    const parseArrumacaoFromRegistro = (r: Registro): ArrumacaoState => {
        if (r.arrumacao_json) {
            try {
                const parsed = JSON.parse(String(r.arrumacao_json));
                return {
                    ...defaultArrumacao(),
                    ...parsed,
                };
            } catch {
                // ignore
            }
        }
        return defaultArrumacao();
    };

    const abrirWizard = useCallback(
        (tipo: "novo" | "editar", idx: number | null = null, grupoStep: number | null = null) => {
            const editing = tipo === "editar";
            setWizardEditing(editing);
            setWizardIdx(idx);
            setWizardRestrictGroup(grupoStep);
            setWizardStep(grupoStep ?? 0);
            setWizardMsg(null);
            setWizardTitle(editing ? "Editar Registro" : "Novo Registro");

            if (editing && idx !== null && registros[idx]) {
                const r = registros[idx];
                const data: Registro = {};
                steps.forEach((s: any) => {
                    (data as any)[s.id] = (r as any)[s.id] ?? "";
                });
                data.id = r.id;

                // Materiais
                const mats = parseMateriaisFromRegistro(r);
                setMateriais(mats);
                (data as any).materiais = mats;

                // Arrumação
                const arr = parseArrumacaoFromRegistro(r);
                setArrumacao(arr);
                (data as any).arrumacao = arr;

                setWizardData(data);
                setAssistenciaVal(String((r.assistencia ?? "") as string));
                setTanatoVal(String((r.tanato ?? "") as string));
            } else {
                const empty: Registro = {};
                steps.forEach((s: any) => ((empty as any)[s.id] = ""));
                setWizardData(empty);
                setMateriais(defaultMateriais());
                setArrumacao(defaultArrumacao());
                setAssistenciaVal("");
                setTanatoVal("");
            }

            setWizardOpen(true);
        },
        [registros]
    );

    const salvarGrupoWizard = useCallback((): Registro | null => {
        const grupo = wizardStepIndexes[wizardStep];
        const next: Registro = { ...wizardData };

        for (const idx of grupo) {
            const s = steps[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as
                | HTMLInputElement
                | HTMLTextAreaElement
                | null;
            const v = (el?.value ?? "").trim();

            if (obrigatorios.includes(s.id) && !v) {
                el?.focus();
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return null;
            }
            (next as any)[s.id] = v;
        }

        // mantém id em edição
        if (wizardData.id != null) next.id = wizardData.id;

        // salva estados auxiliares
        (next as any).materiais = materiais;
        (next as any).arrumacao = arrumacao;

        setWizardData(next);
        return next;
    }, [wizardData, wizardStep, materiais, arrumacao]);

    const concluirWizard = useCallback(async () => {
        const dataAtualizada = salvarGrupoWizard();
        if (!dataAtualizada) return;

        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexes[wizardRestrictGroup];
            const ids = grupo.map((i) => (steps[i] as any).id);
            grupoObrigatorios = ids.filter((id) => obrigatorios.includes(id));
        } else {
            grupoObrigatorios = obrigatorios;
        }

        for (const id of grupoObrigatorios) {
            if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        try {
            const payload = { ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" };
            const json = await enviarRegistroPHP(payload);
            if (json?.sucesso) {
                setWizardMsg({ text: "Registro salvo!", ok: true });
                fetchRegistros();
                setTimeout(() => setWizardOpen(false), 950);
            } else {
                setWizardMsg({ text: json?.erro || "Erro ao salvar!", ok: false });
            }
        } catch (e: any) {
            setWizardMsg({ text: e?.message || "Erro ao salvar!", ok: false });
        }
    }, [salvarGrupoWizard, wizardRestrictGroup, wizardEditing, enviarRegistroPHP, fetchRegistros]);

    /* -------------------- Ações (status) -------------------- */

    const abrirPopupAcao = useCallback((idx: number) => {
        setAcaoMsg(null);
        setAcaoIdx(idx);
        setAcaoSubmitting(false);
        setAcaoOpen(true);
    }, []);

    const proximaFase = useCallback((r: Registro) => {
        const atual = r.status || "fase00";
        let nextIdx = fases.indexOf(atual as any) + 1;

        const skipTransportando = salasMemorial.includes((r.local_velorio || "").trim());
        const skipConservacao = isTanatoNo(r.tanato);

        while (nextIdx < fases.length) {
            const next = fases[nextIdx];
            if (skipTransportando && next === "fase07") {
                nextIdx++;
                continue;
            }
            if (skipConservacao && (next === "fase03" || next === "fase04")) {
                nextIdx++;
                continue;
            }
            return next;
        }
        return null;
    }, []);

    const registrarAcao = useCallback(
        async (acao: string) => {
            if (acaoSubmitting) return; // trava duplo clique
            if (acaoIdx == null || !registros[acaoIdx]) return;

            const id = registros[acaoIdx].id;
            const ok = window.confirm("Deseja confirmar essa ação?");
            if (!ok) return;

            setAcaoSubmitting(true);
            try {
                const json = await enviarRegistroPHP({
                    acao: "atualizar_status",
                    id,
                    status: acao,
                });

                if (json?.sucesso) {
                    setAcaoMsg({
                        text: `Status alterado para "${capitalizeStatus(acao)}"`,
                        ok: true,
                    });
                    fetchRegistros();
                    setTimeout(() => setAcaoOpen(false), 500);
                } else {
                    setAcaoSubmitting(false);
                    setAcaoMsg({
                        text: json?.erro || "Erro ao atualizar status.",
                        ok: false,
                    });
                }
            } catch (e: any) {
                setAcaoSubmitting(false);
                setAcaoMsg({ text: e?.message || "Erro ao atualizar status.", ok: false });
            }
        },
        [acaoIdx, registros, enviarRegistroPHP, fetchRegistros, acaoSubmitting]
    );

    /* -------------------- Info Etapas -------------------- */

    const abrirInfoEtapas = useCallback((idx: number) => {
        setInfoIdx(idx);
        setInfoOpen(true);
    }, []);

    /* -------------------- Avisos -------------------- */

    const enviarAviso = useCallback(async () => {
        const val = (avisoInputRef.current?.value ?? "").trim();
        if (!val) {
            setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
            return;
        }
        try {
            const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensagem: val }),
            });
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso adicionado!", ok: true });
                if (avisoInputRef.current) avisoInputRef.current.value = "";
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao adicionar!", ok: false });
            }
        } catch (e: any) {
            setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, mensagem }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao editar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao editar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const excluirAviso = useCallback(
        async (id: number | string) => {
            if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, excluir: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso excluído!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao excluir!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao excluir!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const finalizarAviso = useCallback(
        async (id: number | string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, finalizar: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao finalizar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    /* -------------------- Helpers UI -------------------- */

    const materiaisSelecionadosResumo = useMemo(() => {
        const list: string[] = [];
        materiaisConfig.forEach((m) => {
            const it = materiais[m.key];
            if (it?.checked) {
                list.push(`${m.label} (${it.qtd})`);
            }
        });
        return list.join(" • ");
    }, [materiais]);

    const arrumacaoSelecionadaResumo = useMemo(() => {
        const mapa: { key: keyof ArrumacaoState; label: string }[] = [
            { key: "luvas", label: "Luvas" },
            { key: "palha", label: "Palha" },
            { key: "tamponamento", label: "Tamponamento" },
            { key: "maquiagem", label: "Maquiagem" },
            { key: "algodao", label: "Algodão" },
            { key: "cordao", label: "Cordão" },
            { key: "barba", label: "Barba" },
        ];
        return mapa
            .filter((o) => arrumacao[o.key])
            .map((o) => o.label)
            .join(" • ");
    }, [arrumacao]);

    /* -------------------- Render -------------------- */

    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Gestão de Atendimentos</h1>
                    <p className="text-sm text-muted-foreground">
                        Cadastre, acompanhe e atualize o status dos atendimentos.
                    </p>
                </div>
                <button
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    onClick={() => abrirWizard("novo")}
                >
                    Novo Registro
                </button>
            </header>

            {/* Tabela */}
            <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="w-40 px-3 py-2 text-left font-semibold">Status</th>
                            <th className="px-3 py-2 text-left font-semibold">Falecido(a)</th>
                            <th className="w-48 px-3 py-2 text-left font-semibold">Agente</th>
                            <th className="w-36 px-3 py-2 text-left font-semibold">Ações</th>
                            <th className="w-28 px-3 py-2 text-left font-semibold">Info</th>
                        </tr>
                    </thead>
                    <tbody id="tb-registros">
                        {registrosVisiveis.length === 0 && (
                            <tr>
                                <td className="px-3 py-6 text-center opacity-70" colSpan={5}>
                                    Nenhum registro cadastrado.
                                </td>
                            </tr>
                        )}
                        {registrosVisiveis.map((r, idx) => (
                            <tr key={String(r.id ?? idx)} className="border-t">
                                <td className="px-3 py-2">
                                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                                        {capitalizeStatus(r.status)}
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{r.falecido || ""}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2">{r.agente || ""}</td>
                                <td className="px-3 py-2">
                                    <button
                                        className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                                        onClick={() => abrirPopupAcao(idx)}
                                    >
                                        Ações
                                    </button>
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                                        onClick={() => abrirInfoEtapas(idx)}
                                    >
                                        Info
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Avisos */}
            <section className="mt-8 rounded-xl border p-4">
                <h2 className="text-lg font-semibold">Avisos do Plantão</h2>
                <div className="mt-3 flex gap-2">
                    <input
                        ref={avisoInputRef}
                        type="text"
                        maxLength={255}
                        placeholder="Digite um aviso..."
                        className="flex-1 rounded-md border px-3 py-2 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") enviarAviso();
                        }}
                    />
                </div>
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                        onClick={enviarAviso}
                    >
                        Enviar
                    </button>
                    {avisoMsg && (
                        <TextFeedback kind={avisoMsg.ok ? "success" : "error"}>
                            {avisoMsg.text}
                        </TextFeedback>
                    )}
                </div>

                <ul className="mt-4 space-y-2">
                    {avisos
                        .filter((a) => a.finalizado !== 1)
                        .map((a) => (
                            <li
                                key={String(a.id)}
                                className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                            >
                                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                                    {a.usuario}
                                </span>
                                <EditableText
                                    text={a.mensagem}
                                    onSave={(t) => editarAviso(a.id, t)}
                                    className="min-w-[220px] flex-1"
                                />
                                <span className="text-xs opacity-70">
                                    {new Date(a.criado_em).toLocaleString()}
                                </span>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        className="rounded-md border px-2 py-1 text-xs"
                                        onClick={() => excluirAviso(a.id)}
                                    >
                                        Excluir
                                    </button>
                                    <button
                                        className="rounded-md border px-2 py-1 text-xs"
                                        onClick={() => finalizarAviso(a.id)}
                                    >
                                        Finalizar
                                    </button>
                                </div>
                            </li>
                        ))}
                </ul>
            </section>

            {/* Modal: Wizard (novo/editar) */}
            <Modal open={wizardOpen} onClose={() => setWizardOpen(false)} ariaLabel="Novo registro">
                <h2 className="text-xl font-semibold">{wizardTitle}</h2>

                <form
                    className="mt-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        concluirWizard();
                    }}
                >
                    <div className="grid gap-4">
                        {wizardStepIndexes[wizardStep].map((i) => {
                            const s = steps[i] as any;
                            const val = (wizardData as any)[s.id] ?? "";
                            const id = "wizard-" + s.id;

                            if (s.type === "input" || s.type === "date" || s.type === "time") {
                                return (
                                    <div key={id}>
                                        <FieldLabel>
                                            {s.label}
                                            {obrigatorios.includes(s.id) ? " *" : ""}
                                        </FieldLabel>
                                        <input
                                            id={id}
                                            name={s.id}
                                            type={s.type}
                                            defaultValue={val}
                                            placeholder={s.placeholder || ""}
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                        />
                                    </div>
                                );
                            }

                            if (s.type === "select") {
                                if (s.id === "assistencia") {
                                    return (
                                        <div key={id}>
                                            <FieldLabel>
                                                {s.label}
                                                {obrigatorios.includes(s.id) ? " *" : ""}
                                            </FieldLabel>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <select
                                                    id={id}
                                                    name={s.id}
                                                    value={assistenciaVal || val}
                                                    onChange={(e) => setAssistenciaVal(e.target.value)}
                                                    className="w-full max-w-[320px] rounded-md border px-3 py-2 text-sm"
                                                >
                                                    {s.options.map((opt: string) => (
                                                        <option key={opt} value={opt}>
                                                            {opt}
                                                        </option>
                                                    ))}
                                                </select>

                                                {(assistenciaVal || val) === "Sim" && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="whitespace-nowrap rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                                            onClick={() => setMateriaisOpen(true)}
                                                            title="Selecionar materiais"
                                                        >
                                                            Materiais
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="whitespace-nowrap rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                                            onClick={() => setArrumacaoOpen(true)}
                                                            title="Arrumação do Corpo"
                                                        >
                                                            Arrumação do Corpo
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {(assistenciaVal || val) === "Sim" && (
                                                <>
                                                    {materiaisSelecionadosResumo && (
                                                        <div className="mt-2 text-xs text-muted-foreground">
                                                            Selecionados (Materiais): {materiaisSelecionadosResumo}
                                                        </div>
                                                    )}
                                                    {arrumacaoSelecionadaResumo && (
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            Selecionados (Arrumação): {arrumacaoSelecionadaResumo}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                }

                                if (s.id === "tanato") {
                                    return (
                                        <div key={id}>
                                            <FieldLabel>
                                                {s.label}
                                                {obrigatorios.includes(s.id) ? " *" : ""}
                                            </FieldLabel>
                                            <select
                                                id={id}
                                                name={s.id}
                                                value={tanatoVal || val}
                                                onChange={(e) => setTanatoVal(e.target.value)}
                                                className="w-full rounded-md border px-3 py-2 text-sm"
                                            >
                                                {s.options.map((opt: string) => (
                                                    <option key={opt} value={opt}>
                                                        {opt}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={id}>
                                        <FieldLabel>
                                            {s.label}
                                            {obrigatorios.includes(s.id) ? " *" : ""}
                                        </FieldLabel>
                                        <select
                                            id={id}
                                            name={s.id}
                                            defaultValue={val}
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                        >
                                            {s.options.map((opt: string) => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            }

                            if (s.type === "datalist") {
                                return (
                                    <div key={id}>
                                        <FieldLabel>{s.label}</FieldLabel>
                                        <input
                                            id={id}
                                            name={s.id}
                                            list={`datalist-${s.id}`}
                                            defaultValue={val}
                                            placeholder={s.placeholder || ""}
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                        />
                                        <datalist id={`datalist-${s.id}`}>
                                            {s.datalist.map((opt: string) => (
                                                <option key={opt} value={opt} />
                                            ))}
                                        </datalist>
                                    </div>
                                );
                            }

                            // textarea
                            return (
                                <div key={id}>
                                    <FieldLabel>{s.label}</FieldLabel>
                                    <textarea
                                        id={id}
                                        name={s.id}
                                        defaultValue={val}
                                        placeholder={s.placeholder || ""}
                                        className="min-h-28 w-full rounded-md border px-3 py-2 text-sm"
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Navegação */}
                    <div className="mt-5 flex items-center gap-2">
                        {wizardRestrictGroup == null && (
                            <button
                                type="button"
                                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                disabled={wizardStep <= 0}
                                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                            >
                                Voltar
                            </button>
                        )}

                        {wizardRestrictGroup == null &&
                            wizardStep < wizardStepIndexes.length - 1 && (
                                <button
                                    type="button"
                                    className="rounded-md border px-3 py-2 text-sm"
                                    onClick={() => {
                                        const ok = salvarGrupoWizard();
                                        if (ok)
                                            setWizardStep((s) =>
                                                Math.min(s + 1, wizardStepIndexes.length - 1)
                                            );
                                    }}
                                >
                                    Avançar
                                </button>
                            )}

                        <button
                            type="button"
                            className="ml-auto rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                            onClick={concluirWizard}
                        >
                            {wizardRestrictGroup == null &&
                                wizardStep === wizardStepIndexes.length - 1
                                ? "Concluir"
                                : "Salvar"}
                        </button>
                    </div>

                    <div className="mt-2 text-sm opacity-80">
                        {wizardRestrictGroup != null
                            ? `Editar: ${wizardStepTitles[wizardStep]}`
                            : `Etapa ${wizardStep + 1} de ${wizardStepTitles.length}: ${wizardStepTitles[wizardStep]
                            }`}
                    </div>

                    {wizardMsg && (
                        <TextFeedback kind={wizardMsg.ok ? "success" : "error"}>
                            {wizardMsg.text}
                        </TextFeedback>
                    )}
                </form>
            </Modal>

            {/* Modal: Materiais */}
            <Modal open={materiaisOpen} onClose={() => setMateriaisOpen(false)} ariaLabel="Materiais" maxWidth={560}>
                <h3 className="text-lg font-semibold">Materiais para Assistência</h3>

                <div className="mt-4 space-y-3">
                    {materiaisConfig.map((m) => {
                        const item = materiais[m.key];
                        return (
                            <div className="flex items-center gap-3" key={m.key}>
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!!item.checked}
                                        onChange={(e) =>
                                            setMateriais((prev) => ({
                                                ...prev,
                                                [m.key]: {
                                                    ...prev[m.key],
                                                    checked: e.target.checked,
                                                    qtd: e.target.checked ? Math.max(1, prev[m.key].qtd) : 0,
                                                },
                                            }))
                                        }
                                    />
                                    <span>{m.label}</span>
                                </label>

                                <input
                                    type="number"
                                    min={1}
                                    className="w-28 rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                                    disabled={!item.checked}
                                    value={item.checked ? item.qtd : ""}
                                    onChange={(e) =>
                                        setMateriais((prev) => ({
                                            ...prev,
                                            [m.key]: {
                                                ...prev[m.key],
                                                qtd: Math.max(1, Number(e.target.value || 0)),
                                            },
                                        }))
                                    }
                                    placeholder="Qtd"
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        className="rounded-md border px-3 py-2 text-sm"
                        onClick={() => setMateriaisOpen(false)}
                    >
                        Cancelar
                    </button>
                    <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        onClick={() => {
                            setWizardData((d) => ({ ...d, materiais }));
                            setMateriaisOpen(false);
                        }}
                    >
                        Salvar Materiais
                    </button>
                </div>
            </Modal>

            {/* Modal: Arrumação do Corpo */}
            <Modal
                open={arrumacaoOpen}
                onClose={() => setArrumacaoOpen(false)}
                ariaLabel="Arrumação do Corpo"
                maxWidth={520}
            >
                <h3 className="text-lg font-semibold">Arrumação do Corpo</h3>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {([
                        { key: "luvas", label: "Luvas" },
                        { key: "palha", label: "Palha" },
                        { key: "tamponamento", label: "Tamponamento" },
                        { key: "maquiagem", label: "Maquiagem" },
                        { key: "algodao", label: "Algodão" },
                        { key: "cordao", label: "Cordão" },
                        { key: "barba", label: "Barba" },
                    ] as { key: keyof ArrumacaoState; label: string }[]).map((o) => (
                        <label key={o.key} className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={!!arrumacao[o.key]}
                                onChange={(e) =>
                                    setArrumacao((prev) => ({ ...prev, [o.key]: e.target.checked }))
                                }
                            />
                            <span>{o.label}</span>
                        </label>
                    ))}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        className="rounded-md border px-3 py-2 text-sm"
                        onClick={() => setArrumacaoOpen(false)}
                    >
                        Cancelar
                    </button>
                    <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        onClick={() => {
                            setWizardData((d) => ({ ...d, arrumacao }));
                            setArrumacaoOpen(false);
                        }}
                    >
                        Salvar Arrumação
                    </button>
                </div>
            </Modal>

            {/* Modal: Registrar Ação */}
            <Modal open={acaoOpen} onClose={() => setAcaoOpen(false)} ariaLabel="Registrar ação">
                <h2 className="text-xl font-semibold">Registrar uma ação</h2>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(() => {
                        const r = acaoIdx != null ? registros[acaoIdx] : undefined;
                        const skipConservacao = r ? isTanatoNo(r.tanato) : false;
                        const skipTransportando = r
                            ? salasMemorial.includes((r.local_velorio || "").trim())
                            : false;
                        const prox = r ? proximaFase(r) : null;

                        return fases.map((f) => {
                            if (!r) return null;
                            if (skipTransportando && f === "fase07") return null;
                            if (skipConservacao && (f === "fase03" || f === "fase04")) return null;

                            const habilitar = prox === f; // somente a próxima fase habilita
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    disabled={!habilitar || acaoSubmitting}
                                    onClick={() => registrarAcao(f)}
                                    className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar && !acaoSubmitting
                                            ? "hover:bg-muted"
                                            : "pointer-events-none opacity-50"
                                        }`}
                                    title={
                                        habilitar ? "Confirmar próxima etapa" : "Aguardando etapas anteriores"
                                    }
                                >
                                    {acaoToStatus(f)}
                                </button>
                            );
                        });
                    })()}
                </div>

                {acaoMsg && (
                    <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>
                        {acaoMsg.text}
                    </TextFeedback>
                )}
            </Modal>

            {/* Modal: Info Etapas */}
            <Modal open={infoOpen} onClose={() => setInfoOpen(false)} ariaLabel="Info" maxWidth={410}>
                <h2 className="text-xl font-semibold">Informações do Registro</h2>
                <div className="mt-4 grid gap-2">
                    {wizardStepTitles.map((t, i) => (
                        <button
                            key={t}
                            className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
                            onClick={() => {
                                setInfoOpen(false);
                                if (infoIdx != null) abrirWizard("editar", infoIdx, i);
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
}

/* -----------------------------------------------------------
   Componente de texto editável para avisos
----------------------------------------------------------- */

function EditableText({
    text,
    onSave,
    className,
}: {
    text: string;
    onSave: (t: string) => void;
    className?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(text);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => setVal(text), [text]);

    useEffect(() => {
        if (editing) {
            const t = setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
            return () => clearTimeout(t);
        }
    }, [editing]);

    if (!editing) {
        return (
            <button
                className={`text-left ${className ?? ""}`}
                onClick={() => setEditing(true)}
                title="Clique para editar"
            >
                {text}
            </button>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className ?? ""}`}>
            <input
                ref={inputRef}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(false);
                    if (e.key === "Enter") {
                        if (!val.trim()) return;
                        onSave(val.trim());
                        setEditing(false);
                    }
                }}
                maxLength={255}
                className="min-w-[220px] flex-1 rounded-md border px-2 py-1 text-sm"
            />
            <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => {
                    if (!val.trim()) return;
                    onSave(val.trim());
                    setEditing(false);
                }}
            >
                Salvar
            </button>
            <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => setEditing(false)}
            >
                Cancelar
            </button>
        </div>
    );
}
