"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   Tipos
============================================================ */
type RegistroSala = {
    id: number | string;
    sala: "Sala 01" | "Sala 02" | "Sala 03" | string;
    nome_completo: string;
    data_nascimento?: string;
    data_falecimento?: string;
    horario_inicio?: string;
    horario_termino?: string;
    data_sepultamento?: string;
    horario_sepultamento?: string;
    local_sepultamento?: string;
    foto_falecido?: string | null;
};

/* ============================================================
   Utils
============================================================ */
function normalizarSala(s?: string | null): "Sala 01" | "Sala 02" | "Sala 03" {
    if (!s) return "Sala 01";
    const val = s.toLowerCase();
    if (val.includes("sala_01") || val.includes("sala 01")) return "Sala 01";
    if (val.includes("sala_02") || val.includes("sala 02")) return "Sala 02";
    if (val.includes("sala_03") || val.includes("sala 03")) return "Sala 03";
    return "Sala 01";
}

/** Blindagem extra no front para qualquer valor de foto vindo do back */
function fixFotoUrl(path?: string | null): string | null {
    if (!path) return null;
    try {
        // Resolve contra o mesmo host (aceita absolutas/relativas/filename puro)
        const u = new URL(path, window.location.origin);
        let p = u.pathname.replace(/\\/g, "/");

        // Normaliza /api/php/uploads/ -> /uploads/
        p = p.replace(/\/?api\/php\/uploads\//i, "/uploads/");

        // Remove duplicações "uploads/uploads/"
        p = p.replace(/\/+uploads\/+uploads\//gi, "/uploads/");

        // Se não começar com "/uploads/", prefixa
        if (!/^\/uploads\//i.test(p)) {
            p = "/uploads/" + p.replace(/^\/+/, "");
        }

        // Colapsa barras repetidas
        p = p.replace(/\/{2,}/g, "/");

        return p;
    } catch {
        // fallback: trata como relativo simples
        let p = (path || "").replace(/\\/g, "/");
        p = p.replace(/\/?api\/php\/uploads\//i, "/uploads/");
        p = p.replace(/\/+uploads\/+uploads\//gi, "/uploads/");
        if (!/^\/uploads\//i.test(p)) p = "/uploads/" + p.replace(/^\/+/, "");
        p = p.replace(/\/{2,}/g, "/");
        return p;
    }
}

/* ============================================================
   Componentes auxiliares
============================================================ */
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
            className="fixed inset-0 z-50 bg-black/50 
                 overflow-y-auto flex justify-center items-start 
                 p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full rounded-xl bg-white p-5 shadow-xl outline-none
                   max-h-[85dvh] overflow-y-auto"
                style={{
                    maxWidth: maxWidth ?? 720,
                    WebkitOverflowScrolling: "touch" as any,
                }}
            >
                {children}
            </div>
        </div>
    );
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
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-200"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200"
                }`}
        >
            {children}
        </div>
    );
}

/* helper de estilo para os botões de sala */
const salaBtn = (active: boolean) =>
    `w-full rounded-2xl border px-6 py-3 text-base font-semibold transition
   ${active ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-muted hover:bg-muted/50"}`;

/* ============================================================
   Página
============================================================ */
export default function AtendimentoPage() {
    // ----------------- Multi-step -----------------
    const TOTAL_STEPS = 13; // 0..12
    const [step, setStep] = useState(0);

    // Sala com botões
    const [salaSelecionada, setSalaSelecionada] =
        useState<"Sala 01" | "Sala 02" | "Sala 03">("Sala 01");

    // Estado do formulário
    const [form, setForm] = useState({
        nome: "",
        dataNascimento: "",
        dataFalecimento: "",
        localVelorio: "Memorial Senhor do Bonfim",
        dataSepultamento: "",
        horarioSepultamento: "",
        localSepultamento: "",
        dataVelorio: "",
        horarioInicio: "",
        dataFim: "",
        horarioTermino: "",
    });
    const [fotoFalecido, setFotoFalecido] = useState<File | null>(null);
    const refFoto = useRef<HTMLInputElement>(null);

    const [respMsg, setRespMsg] = useState<{ text: string; ok: boolean } | null>(
        null
    );

    const [submitting, setSubmitting] = useState(false);

    const showPrev = step > 0;
    const showNext = step < TOTAL_STEPS - 1;
    const showSubmit = step === TOTAL_STEPS - 1;

    const moveStep = (delta: number) => {
        setStep((s) => Math.min(Math.max(0, s + delta), TOTAL_STEPS - 1));
    };

    const limparFormulario = () => {
        setSalaSelecionada("Sala 01");
        setForm({
            nome: "",
            dataNascimento: "",
            dataFalecimento: "",
            localVelorio: "Memorial Senhor do Bonfim",
            dataSepultamento: "",
            horarioSepultamento: "",
            localSepultamento: "",
            dataVelorio: "",
            horarioInicio: "",
            dataFim: "",
            horarioTermino: "",
        });
        setFotoFalecido(null);
        if (refFoto.current) refFoto.current.value = "";
    };

    const salvarInformacoes = useCallback(async () => {
        if (submitting) return;
        setSubmitting(true);

        if (!form.nome || !form.localVelorio || !form.dataVelorio || !form.horarioInicio) {
            setRespMsg({ text: "Preencha os campos obrigatórios.", ok: false });
            setSubmitting(false);
            return;
        }

        const fd = new FormData();
        fd.append("sala", salaSelecionada);
        fd.append("nome", form.nome);
        fd.append("dataNascimento", form.dataNascimento);
        fd.append("dataFalecimento", form.dataFalecimento);
        fd.append("localVelorio", form.localVelorio);
        fd.append("dataSepultamento", form.dataSepultamento);
        fd.append("horarioSepultamento", form.horarioSepultamento);
        fd.append("localSepultamento", form.localSepultamento);
        fd.append("dataVelorio", form.dataVelorio);
        fd.append("horarioInicio", form.horarioInicio);
        fd.append("dataFim", form.dataFim);
        fd.append("horarioTermino", form.horarioTermino);
        if (fotoFalecido) fd.append("foto_falecido", fotoFalecido);

        try {
            const res = await fetch("/api/php/salvarDados.php", {
                method: "POST",
                body: fd,
                cache: "no-store",
            });

            let data: any = null;
            try {
                data = await res.json();
            } catch { }

            if (res.ok && (data?.success ?? data?.sucesso ?? true)) {
                setRespMsg({ text: "Atendimento Criado Com Sucesso!", ok: true });
                await carregarDados();
                limparFormulario();
                setStep(0);
            } else {
                setRespMsg({
                    text: data?.message || data?.msg || `Erro ao criar (HTTP ${res.status})`,
                    ok: false,
                });
            }
        } catch {
            setRespMsg({ text: "Erro ao Criar o Atendimento.", ok: false });
        } finally {
            setSubmitting(false);
        }
    }, [form, salaSelecionada, fotoFalecido, submitting]);

    // ----------------- Tabela / Edição -----------------
    const [linhas, setLinhas] = useState<RegistroSala[]>([]);
    const [errEdicao, setErrEdicao] = useState<string | null>(null);

    const carregarDados = useCallback(async () => {
        try {
            const res = await fetch(
                "/api/php/salaControle.php?action=listar&_=" + Date.now(),
                { cache: "no-store" }
            );
            if (!res.ok) throw new Error(res.statusText);
            const data = (await res.json()) as RegistroSala[] | { dados?: RegistroSala[] };

            const arr = (Array.isArray(data) ? data : data?.dados ?? []) as RegistroSala[];

            // Normaliza foto no front (camada extra de proteção)
            const norm = arr.map((r) => ({
                ...r,
                foto_falecido: fixFotoUrl(r.foto_falecido),
            }));

            setLinhas(norm || []);
            setErrEdicao(null);
        } catch (e: any) {
            setErrEdicao("Erro ao carregar dados. Verifique o console para detalhes.");
            console.error("Erro ao carregar dados:", e);
        }
    }, []);

    // Edição (popup)
    const [editOpen, setEditOpen] = useState(false);
    const [edit, setEdit] = useState<RegistroSala | null>(null);
    const [editFoto, setEditFoto] = useState<File | null>(null);
    const [removerFoto, setRemoverFoto] = useState(false);

    const abrirEditar = useCallback(async (id: number | string) => {
        try {
            const res = await fetch(
                `/api/php/salaControle.php?action=consultar&id=${id}&_=${Date.now()}`,
                { cache: "no-store" }
            );
            if (!res.ok) throw new Error(res.statusText);
            const d = await res.json();

            setEdit({
                id: d.id,
                sala: normalizarSala(d.sala),
                nome_completo: d.nome_completo ?? "",
                data_nascimento: d.data_nascimento ?? "",
                data_falecimento: d.data_falecimento ?? "",
                horario_inicio: d.horario_inicio ?? "",
                horario_termino: d.horario_termino ?? "",
                data_sepultamento: d.data_sepultamento ?? "",
                horario_sepultamento: d.horario_sepultamento ?? "",
                local_sepultamento: d.local_sepultamento ?? "",
                foto_falecido: fixFotoUrl(d.foto_falecido ?? null),
            });
            setEditFoto(null);
            setRemoverFoto(false);
            setEditOpen(true);
            setErrEdicao(null);
        } catch (e: any) {
            setErrEdicao("Erro ao carregar registro. Verifique o console para detalhes.");
            console.error("Erro ao carregar registro:", e);
        }
    }, []);

    const salvarEdicao = useCallback(async () => {
        if (!edit) return;
        try {
            const fd = new FormData();
            fd.append("id", String(edit.id));
            fd.append("sala", edit.sala);
            fd.append("nome_completo", edit.nome_completo);
            fd.append("data_nascimento", edit.data_nascimento ?? "");
            fd.append("data_falecimento", edit.data_falecimento ?? "");
            fd.append("horario_inicio", edit.horario_inicio ?? "");
            fd.append("horario_termino", edit.horario_termino ?? "");
            fd.append("data_sepultamento", edit.data_sepultamento ?? "");
            fd.append("horario_sepultamento", edit.horario_sepultamento ?? "");
            fd.append("local_sepultamento", edit.local_sepultamento ?? "");

            if (editFoto) {
                fd.append("foto_falecido", editFoto);
            } else if (removerFoto) {
                fd.append("remove_foto", "1");
            }

            const res = await fetch("/api/php/salaControle.php?action=editar", {
                method: "POST",
                body: fd,
                cache: "no-store",
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && (data?.success ?? data?.sucesso ?? true)) {
                setEditOpen(false);
                setEdit(null);
                setEditFoto(null);
                setRemoverFoto(false);
                carregarDados();
            } else {
                alert("Erro ao salvar edição: " + (data?.message || data?.msg || "Desconhecido"));
            }
        } catch (e: any) {
            setErrEdicao("Erro ao salvar edição. Verifique o console para detalhes.");
            console.error("Erro ao salvar edição:", e);
        }
    }, [edit, editFoto, removerFoto, carregarDados]);

    // Exclusão (popup)
    const [delOpen, setDelOpen] = useState(false);
    const [delId, setDelId] = useState<number | string | null>(null);

    const excluirRegistro = useCallback((id: number | string) => {
        setDelId(id);
        setDelOpen(true);
    }, []);

    const confirmarExclusao = useCallback(async () => {
        if (delId == null) return;
        try {
            const res = await fetch(
                `/api/php/salaControle.php?action=excluir&id=${delId}&_=${Date.now()}`,
                { method: "DELETE", cache: "no-store" }
            );
            const data = await res.json().catch(() => ({}));
            if (res.ok && (data?.success ?? data?.sucesso ?? true)) {
                setDelOpen(false);
                setDelId(null);
                carregarDados();
            } else {
                alert("Erro ao excluir registro: " + (data?.message || data?.msg || "Desconhecido"));
            }
        } catch (e: any) {
            setErrEdicao("Erro ao excluir registro. Verifique o console para detalhes.");
            console.error("Erro ao excluir registro:", e);
        }
    }, [delId, carregarDados]);

    // Polling / init
    useEffect(() => {
        carregarDados();
        const id = setInterval(carregarDados, 30000);
        return () => clearInterval(id);
    }, [carregarDados]);

    /* ============================================================
       Render
    ============================================================ */
    return (
        <div className="p-6">
            {/* --- FORMULÁRIO MULTI-STEP --- */}
            <h1 className="text-2xl font-semibold">Novo Atendimento</h1>

            <div className="mt-4 space-y-0">
                {/* Step 0 - Escolha da sala */}
                <section className="step" hidden={step !== 0}>
                    <fieldset className="rounded-2xl border p-4">
                        <div className="mb-2 text-sm font-semibold">Escolha a Sala</div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {(["Sala 01", "Sala 02", "Sala 03"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={salaBtn(salaSelecionada === s)}
                                    onClick={() => setSalaSelecionada(s)}
                                    aria-pressed={salaSelecionada === s}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            A senha/definição será aplicada para a sala selecionada.
                        </p>
                    </fieldset>
                </section>

                {/* Step 1 - Nome */}
                <section className="step" hidden={step !== 1}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="nome" className="text-sm font-medium">
                            Nome Completo:
                        </label>
                        <input
                            type="text"
                            id="nome"
                            name="nome"
                            placeholder="Digite o nome completo"
                            required
                            value={form.nome}
                            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 2 - Data de Nascimento */}
                <section className="step" hidden={step !== 2}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="data-nascimento" className="text-sm font-medium">
                            Data de Nascimento:
                        </label>
                        <input
                            type="date"
                            id="data-nascimento"
                            name="data_nascimento"
                            value={form.dataNascimento}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, dataNascimento: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 3 - Data de Falecimento */}
                <section className="step" hidden={step !== 3}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="data-falecimento" className="text-sm font-medium">
                            Data de Falecimento:
                        </label>
                        <input
                            type="date"
                            id="data-falecimento"
                            name="data_falecimento"
                            value={form.dataFalecimento}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, dataFalecimento: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 4 - Foto */}
                <section className="step" hidden={step !== 4}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="foto-falecido" className="text-sm font-medium">
                            Foto do Falecido:
                        </label>
                        <input
                            ref={refFoto}
                            type="file"
                            id="foto-falecido"
                            name="foto_falecido"
                            accept="image/*"
                            onChange={(e) => setFotoFalecido(e.target.files?.[0] ?? null)}
                            className="w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5"
                        />
                        {fotoFalecido && (
                            <div className="text-xs text-muted-foreground">
                                Arquivo selecionado: <b>{fotoFalecido.name}</b>
                            </div>
                        )}
                    </fieldset>
                </section>

                {/* Step 5 - Local Velório */}
                <section className="step" hidden={step !== 5}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="local-velorio" className="text-sm font-medium">
                            Local do Velório:
                        </label>
                        <input
                            type="text"
                            id="local-velorio"
                            name="local_velorio"
                            required
                            value={form.localVelorio}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, localVelorio: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 6 - Data Sepultamento */}
                <section className="step" hidden={step !== 6}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="data-sepultamento" className="text-sm font-medium">
                            Data do Sepultamento:
                        </label>
                        <input
                            type="date"
                            id="data-sepultamento"
                            name="data_sepultamento"
                            required
                            value={form.dataSepultamento}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, dataSepultamento: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 7 - Horário Sepultamento */}
                <section className="step" hidden={step !== 7}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="horario-sepultamento" className="text-sm font-medium">
                            Horário do Sepultamento:
                        </label>
                        <input
                            type="time"
                            id="horario-sepultamento"
                            name="horario_sepultamento"
                            required
                            value={form.horarioSepultamento}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, horarioSepultamento: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 8 - Local Sepultamento */}
                <section className="step" hidden={step !== 8}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="local-sepultamento" className="text-sm font-medium">
                            Local do Sepultamento:
                        </label>
                        <input
                            type="text"
                            id="local-sepultamento"
                            name="local_sepultamento"
                            required
                            value={form.localSepultamento}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, localSepultamento: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 9 - Data Início (Velório) */}
                <section className="step" hidden={step !== 9}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="data-velorio" className="text-sm font-medium">
                            Data Início (Velório):
                        </label>
                        <input
                            type="date"
                            id="data-velorio"
                            name="data_velorio"
                            required
                            value={form.dataVelorio}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, dataVelorio: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 10 - Horário Início */}
                <section className="step" hidden={step !== 10}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="horario-inicio" className="text-sm font-medium">
                            Horário de Início (Velório):
                        </label>
                        <input
                            type="time"
                            id="horario-inicio"
                            name="horario_inicio"
                            required
                            value={form.horarioInicio}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, horarioInicio: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 11 - Data Fim */}
                <section className="step" hidden={step !== 11}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="data-fim" className="text-sm font-medium">
                            Data Fim (Velório):
                        </label>
                        <input
                            type="date"
                            id="data-fim"
                            name="data_fim"
                            required
                            value={form.dataFim}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, dataFim: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>

                {/* Step 12 - Horário Término */}
                <section className="step" hidden={step !== 12}>
                    <fieldset className="grid gap-2 rounded-2xl border p-4">
                        <label htmlFor="horario-termino" className="text-sm font-medium">
                            Horário de Término (Velório):
                        </label>
                        <input
                            type="time"
                            id="horario-termino"
                            name="horario_termino"
                            required
                            value={form.horarioTermino}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, horarioTermino: e.target.value }))
                            }
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                    </fieldset>
                </section>
            </div>

            {/* Mensagem de resposta */}
            {respMsg && (
                <TextFeedback kind={respMsg.ok ? "success" : "error"}>
                    {respMsg.text}
                </TextFeedback>
            )}

            {/* Navegação */}
            <div className="mt-4 flex items-center gap-2">
                {showPrev && (
                    <button
                        type="button"
                        onClick={() => moveStep(-1)}
                        className="rounded-md border px-3 py-2 text-sm"
                    >
                        Voltar
                    </button>
                )}
                {showNext && (
                    <button
                        type="button"
                        onClick={() => moveStep(1)}
                        className="rounded-md border px-3 py-2 text-sm"
                    >
                        Próximo
                    </button>
                )}
                {showSubmit && !submitting && (
                    <button
                        type="button"
                        onClick={salvarInformacoes}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:opacity-90"
                    >
                        Salvar Informações
                    </button>
                )}
                {showSubmit && submitting && (
                    <div
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600/80 px-3 py-2 text-sm text-white"
                        role="status"
                        aria-live="polite"
                    >
                        <span className="h-3 w-3 animate-pulse rounded-full bg-white"></span>
                        Carregando...
                    </div>
                )}
            </div>

            {/* --- ÁREA DE PERSONALIZAÇÃO / EDIÇÃO --- */}
            <h1 className="mt-9 text-2xl font-semibold">Edição de Dados</h1>
            {errEdicao && <div className="mt-2 text-sm text-red-600">{errEdicao}</div>}

            <div className="mt-3 overflow-x-auto rounded-2xl border">
                <table className="min-w-full text-sm" id="salaTable">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Sala</th>
                            <th className="px-3 py-2 text-left font-semibold">Nome Completo</th>
                            <th className="w-64 px-3 py-2 text-left font-semibold">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {linhas.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-6 text-center opacity-70">
                                    Nenhum registro encontrado.
                                </td>
                            </tr>
                        )}
                        {linhas.map((item) => (
                            <tr key={String(item.id)} className="border-t">
                                <td className="px-3 py-2">{normalizarSala(item.sala)}</td>
                                <td className="px-3 py-2">{item.nome_completo}</td>
                                <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() => abrirEditar(item.id)}
                                        >
                                            Editar
                                        </button>
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() => excluirRegistro(item.id)}
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Popup de Edição */}
            <Modal open={editOpen} onClose={() => setEditOpen(false)} ariaLabel="Editar Registro">
                <div className="flex items-start justify-between">
                    <h2 className="text-xl font-semibold">Editar Registro</h2>
                    <button
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => setEditOpen(false)}
                        aria-label="Fechar"
                    >
                        ×
                    </button>
                </div>

                <div className="mt-4 grid gap-3">
                    <input type="hidden" value={edit?.id ?? ""} readOnly />

                    {/* Sala com botões no modal */}
                    <div>
                        <label className="mb-1 block text-sm font-medium">Sala</label>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {(["Sala 01", "Sala 02", "Sala 03"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={salaBtn(edit?.sala === s)}
                                    onClick={() => setEdit((v) => (v ? { ...v, sala: s } : v))}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium">Nome Completo</label>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={edit?.nome_completo ?? ""}
                            onChange={(e) => setEdit((v) => (v ? { ...v, nome_completo: e.target.value } : v))}
                        />
                    </div>

                    {/* NOVOS CAMPOS NO MODAL */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium">Data de Nascimento</label>
                            <input
                                type="date"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.data_nascimento ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, data_nascimento: e.target.value } : v))
                                }
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Data de Falecimento</label>
                            <input
                                type="date"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.data_falecimento ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, data_falecimento: e.target.value } : v))
                                }
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium">Horário de Início</label>
                            <input
                                type="time"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.horario_inicio ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, horario_inicio: e.target.value } : v))
                                }
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Horário de Término</label>
                            <input
                                type="time"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.horario_termino ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, horario_termino: e.target.value } : v))
                                }
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium">Data do Sepultamento</label>
                            <input
                                type="date"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.data_sepultamento ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, data_sepultamento: e.target.value } : v))
                                }
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">Horário do Sepultamento</label>
                            <input
                                type="time"
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={edit?.horario_sepultamento ?? ""}
                                onChange={(e) =>
                                    setEdit((v) => (v ? { ...v, horario_sepultamento: e.target.value } : v))
                                }
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium">Local do Sepultamento</label>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={edit?.local_sepultamento ?? ""}
                            onChange={(e) =>
                                setEdit((v) => (v ? { ...v, local_sepultamento: e.target.value } : v))
                            }
                        />
                    </div>

                    {/* --------- Edição da IMAGEM --------- */}
                    <div>
                        <label className="mb-1 block text-sm font-medium">Foto do Falecido</label>

                        {edit?.foto_falecido ? (
                            <div className="mb-2 flex items-center gap-3">
                                <img
                                    src={edit.foto_falecido}
                                    alt="Foto atual"
                                    className="h-24 w-24 rounded-md object-cover"
                                />
                                <button
                                    type="button"
                                    className={`text-xs underline ${removerFoto ? "text-red-700" : "text-red-600"}`}
                                    onClick={() => setRemoverFoto((v) => !v)}
                                >
                                    {removerFoto ? "Cancelar remoção" : "Remover foto"}
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">Nenhuma foto cadastrada.</p>
                        )}

                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setEditFoto(e.target.files?.[0] ?? null)}
                            className="mt-1 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5"
                        />
                        {editFoto && (
                            <div className="mt-1 text-xs text-muted-foreground">
                                Nova imagem: <b>{editFoto.name}</b>
                            </div>
                        )}
                        {removerFoto && (
                            <div className="mt-2 text-xs text-red-700">
                                A foto atual será <b>removida</b> ao salvar.
                            </div>
                        )}
                    </div>
                    {/* ------------------------------------ */}

                    <div className="mt-2 flex justify-end gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditOpen(false)}>
                            Cancelar
                        </button>
                        <button
                            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:opacity-90"
                            onClick={salvarEdicao}
                        >
                            Salvar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Popup de Confirmação (Excluir) */}
            <Modal open={delOpen} onClose={() => setDelOpen(false)} ariaLabel="Confirmar exclusão" maxWidth={480}>
                <div className="flex items-start justify-between">
                    <h2 className="text-xl font-semibold">Tem certeza?</h2>
                    <button
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => setDelOpen(false)}
                        aria-label="Fechar"
                    >
                        ×
                    </button>
                </div>
                <p className="mt-2 text-sm">
                    Você está prestes a excluir este registro. Esta ação não pode ser desfeita.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                    <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setDelOpen(false)}>
                        Cancelar
                    </button>
                    <button
                        className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:opacity-90"
                        onClick={confirmarExclusao}
                    >
                        Sim, excluir
                    </button>
                </div>
            </Modal>
        </div>
    );
}
