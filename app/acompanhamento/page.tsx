"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* -----------------------------------------------------------
   Tipos
----------------------------------------------------------- */
type Registro = {
    id?: number | string;
    status?: string; // fase01..fase10
    falecido?: string;
    agente?: string;
    contato?: string;
    religiao?: string;
    convenio?: string;
    urna?: string;
    roupa?: string;
    assistencia?: string;
    tanato?: string;
    local?: string;
    local_velorio?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_inicio_velorio?: string;
    hora_fim_velorio?: string;
    observacao?: string;
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
   Constantes / helpers (mantendo a lógica original)
----------------------------------------------------------- */
const wizardStepTitles = ["Atendimento", "Itens", "Velório 01", "Velório 02"];
const wizardStepIndexes = [
    [0, 1, 2, 3, 14],
    [4, 5, 6, 7, 14],
    [8, 9, 10, 14],
    [11, 12, 13, 14],
];

const steps = [
    { label: "Nome do Falecido(a)", id: "falecido", type: "input", placeholder: "Digite o nome" },
    { label: "Contato", id: "contato", type: "input", placeholder: "Contato/telefone" },
    { label: "Religião", id: "religiao", type: "select", options: ["", "Evangélico", "Católico", "Espirita", "Ateu", "Outras", "Não Informado"] },
    { label: "Convênio", id: "convenio", type: "select", options: ["", "Particular", "Prefeitura de Barreiras", "Prefeitura de Angical", "Prefeitura de São Desidério", "Associado(a)"] },
    { label: "Urna", id: "urna", type: "input", placeholder: "Digite o Modelo Da Urna" },
    {
        label: "Roupa",
        id: "roupa",
        type: "select",
        options: [
            "ROUPA PRÓPRIA",
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
    },
    { label: "Assistência", id: "assistencia", type: "select", options: ["", "Sim", "Não"] },
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },
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
    },
    {
        label: "Local do Velório",
        id: "local_velorio",
        type: "datalist",
        placeholder: "Digite ou escolha",
        datalist: ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"],
    },
    { label: "Data de Início do Velório", id: "data_inicio_velorio", type: "date" },
    { label: "Data de Fim do Velório", id: "data_fim_velorio", type: "date" },
    { label: "Hora de Início do Velório", id: "hora_inicio_velorio", type: "time" },
    { label: "Hora de Fim do Velório", id: "hora_fim_velorio", type: "time" },
    { label: "Observações", id: "observacao", type: "textarea", placeholder: "Digite as observações" },
] as const;

const obrigatorios = ["falecido", "contato", "convenio", "religiao", "urna"];

const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

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
] as const;

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
            return "Concluído";
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
    };
    return map[acao] ?? "fase01";
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
            className={`mt-3 rounded-md px-3 py-2 text-sm ${kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
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
    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // Wizard
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardTitle, setWizardTitle] = useState("Novo Registro");
    const [wizardEditing, setWizardEditing] = useState(false);
    const [wizardIdx, setWizardIdx] = useState<number | null>(null);
    const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState<Registro>({});
    const [wizardMsg, setWizardMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // Ações
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoIdx, setAcaoIdx] = useState<number | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // Info Etapas
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoIdx, setInfoIdx] = useState<number | null>(null);

    /* -------------------- Fetch helpers -------------------- */
    const fetchRegistros = useCallback(() => {
        fetch("https://planoassistencialintegrado.com.br/informativo.php" + Date.now(), {
            cache: "no-store",
            headers: {
                Pragma: "no-cache",
                Expires: "0",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
            credentials: "include",
        })
            .then((r) => r.json())
            .then((json) => setRegistros(Array.isArray(json) ? json : []))
            .catch(() => setRegistros([]));
    }, []);

    const fetchAvisos = useCallback(() => {
        fetch("https://planoassistencialintegrado.com.br/avisos.php?listar=1&_nocache=" + Date.now(), { credentials: "include" })
            .then((r) => r.json())
            .then((json) => setAvisos(Array.isArray(json) ? json : []))
            .catch(() => setAvisos([]));
    }, []);

    const enviarRegistroPHP = useCallback((data: any) => {
        const body = { ...data, local: data.local || "" };
        return fetch("https://planoassistencialintegrado.com.br/informativo.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "include",
        }).then((r) => r.json());
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
            }
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, []);

    /* -------------------- Tabela -------------------- */
    const registrosVisiveis = useMemo(
        () => registros.filter((r) => r.status !== "fase10"),
        [registros]
    );

    /* -------------------- Wizard -------------------- */
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
                steps.forEach((s) => {
                    
                    
                });
                data.id = r.id;
                setWizardData(data);
            } else {
                setWizardData({});
            }
            setWizardOpen(true);
        },
        [registros]
    );

    const salvarGrupoWizard = useCallback(() => {
        const grupo = wizardStepIndexes[wizardStep];
        const next = { ...wizardData };
        for (const idx of grupo) {
            const s = steps[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as HTMLInputElement | null;
            const v = (el?.value ?? "").trim();
            if (obrigatorios.includes(s.id) && !v) {
                el?.focus();
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return false;
            }
            next[s.id] = v;
        }
        setWizardData(next);
        return true;
    }, [wizardData, wizardStep]);

    const concluirWizard = useCallback(async () => {
        if (!salvarGrupoWizard()) return;

        // obrigatórios por grupo (se estiver restrito)
        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexes[wizardRestrictGroup];
            const ids = grupo.map((i) => (steps[i] as any).id);
            grupoObrigatorios = ids.filter((id) => obrigatorios.includes(id));
        } else {
            grupoObrigatorios = obrigatorios;
        }
        for (const id of grupoObrigatorios) {
            if (!wizardData[id] || String(wizardData[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        const payload = { ...wizardData, acao: wizardEditing ? "editar" : "novo" };
        const json = await enviarRegistroPHP(payload);
        if (json?.sucesso) {
            setWizardMsg({ text: "Registro salvo!", ok: true });
            fetchRegistros();
            setTimeout(() => setWizardOpen(false), 950);
        } else {
            setWizardMsg({ text: json?.erro || "Erro ao salvar!", ok: false });
        }
    }, [salvarGrupoWizard, wizardRestrictGroup, wizardData, wizardEditing, enviarRegistroPHP, fetchRegistros]);

    /* -------------------- Ações (status) -------------------- */
    const abrirPopupAcao = useCallback(
        (idx: number) => {
            setAcaoMsg(null);
            setAcaoIdx(idx);

            const registro = registros[idx];
            if (!registro) return;

            if (registro.status === "fase10") {
                setAcaoOpen(false);
                return;
            }
            setAcaoOpen(true);
        },
        [registros]
    );

    const proximaFase = useCallback(
        (r: Registro) => {
            const atual = r.status || "fase00";
            let nextIdx = fases.indexOf(atual as any) + 1;
            const esconderTransportando = salasMemorial.includes((r.local_velorio || "").trim());
            if (esconderTransportando && fases[nextIdx] === "fase07") nextIdx++;
            return fases[nextIdx] ?? null;
        },
        []
    );

    const registrarAcao = useCallback(
        async (acao: string) => {
            if (acao === "fase10") {
                const ok = window.confirm(
                    "O material desse serviço foi recolhido?\n(se SIM, a ação será concluída)"
                );
                if (!ok) return;
            } else {
                const ok = window.confirm("Deseja confirmar essa ação?");
                if (!ok) return;
            }

            if (acaoIdx == null || !registros[acaoIdx]) return;
            const id = registros[acaoIdx].id;

            const json = await enviarRegistroPHP({ acao: "atualizar_status", id, status: acao });
            if (json?.sucesso) {
                setAcaoMsg({ text: `Status alterado para "${capitalizeStatus(acao)}"`, ok: true });
                fetchRegistros();
                setTimeout(() => {
                    setAcaoOpen(false);
                    if (acao !== "fase10") setTimeout(() => setAcaoOpen(true), 100);
                }, 600);
            } else {
                setAcaoMsg({ text: "Erro ao atualizar status.", ok: false });
            }
        },
        [acaoIdx, registros, enviarRegistroPHP, fetchRegistros]
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
        const res = await fetch("https://planoassistencialintegrado.com.br/avisos.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mensagem: val }),
            credentials: "include",
        }).then((r) => r.json());

        if (res?.sucesso) {
            setAvisoMsg({ text: "Aviso adicionado!", ok: true });
            if (avisoInputRef.current) avisoInputRef.current.value = "";
            fetchAvisos();
        } else {
            setAvisoMsg({ text: res?.erro || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            const res = await fetch("https://planoassistencialintegrado.com.br/avisos.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, mensagem }),
                credentials: "include",
            }).then((r) => r.json());
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao editar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const excluirAviso = useCallback(
        async (id: number | string) => {
            if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;
            const res = await fetch("https://planoassistencialintegrado.com.br/avisos.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, excluir: true }),
                credentials: "include",
            }).then((r) => r.json());
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso excluído!", ok: true });
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao excluir!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const finalizarAviso = useCallback(
        async (id: number | string) => {
            const res = await fetch("https://planoassistencialintegrado.com.br/avisos.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, finalizar: true }),
                credentials: "include",
            }).then((r) => r.json());
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

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
                    <button
                        type="button"
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                        onClick={enviarAviso}
                    >
                        Enviar
                    </button>
                </div>

                {avisoMsg && <TextFeedback kind={avisoMsg.ok ? "success" : "error"}>{avisoMsg.text}</TextFeedback>}

                <ul className="mt-4 space-y-2">
                    {avisos
                        .filter((a) => a.finalizado !== 1)
                        .map((a) => (
                            <li key={String(a.id)} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                                <span className="rounded bg-muted px-2 py-0.5 text-xs">{a.usuario}</span>
                                <EditableText
                                    text={a.mensagem}
                                    onSave={(t) => editarAviso(a.id, t)}
                                    className="min-w-[220px] flex-1"
                                />
                                <span className="text-xs opacity-70">
                                    {new Date(a.criado_em).toLocaleString()}
                                </span>
                                <div className="ml-auto flex gap-2">
                                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => excluirAviso(a.id)}>
                                        Excluir
                                    </button>
                                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => finalizarAviso(a.id)}>
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

                        {wizardRestrictGroup == null && wizardStep < wizardStepIndexes.length - 1 && (
                            <button
                                type="button"
                                className="rounded-md border px-3 py-2 text-sm"
                                onClick={() => {
                                    if (salvarGrupoWizard()) setWizardStep((s) => Math.min(s + 1, wizardStepIndexes.length - 1));
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
                            {wizardRestrictGroup == null && wizardStep === wizardStepIndexes.length - 1 ? "Concluir" : "Salvar"}
                        </button>
                    </div>

                    <div className="mt-2 text-sm opacity-80">
                        {wizardRestrictGroup != null
                            ? `Editar: ${wizardStepTitles[wizardStep]}`
                            : `Etapa ${wizardStep + 1} de ${wizardStepTitles.length}: ${wizardStepTitles[wizardStep]}`}
                    </div>

                    {wizardMsg && <TextFeedback kind={wizardMsg.ok ? "success" : "error"}>{wizardMsg.text}</TextFeedback>}
                </form>
            </Modal>

            {/* Modal: Registrar Ação */}
            <Modal open={acaoOpen} onClose={() => setAcaoOpen(false)} ariaLabel="Registrar ação">
                <h2 className="text-xl font-semibold">Registrar uma ação</h2>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fases.map((f) => {
                        const r = acaoIdx != null ? registros[acaoIdx] : undefined;
                        const prox = r ? proximaFase(r) : null;
                        const esconder =
                            r && salasMemorial.includes((r.local_velorio || "").trim()) && f === "fase07";
                        if (esconder) return null;

                        const habilitar = prox === f && r?.status !== "fase10";
                        return (
                            <button
                                key={f}
                                type="button"
                                disabled={!habilitar}
                                onClick={() => registrarAcao(f)}
                                className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar ? "opacity-100" : "pointer-events-none opacity-50"
                                    }`}
                            >
                                {acaoToStatus(f)}
                            </button>
                        );
                    })}
                </div>
                {acaoMsg && <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>}
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
            <button className="rounded-md border px-2 py-1 text-xs" onClick={() => setEditing(false)}>
                Cancelar
            </button>
        </div>
    );
}
