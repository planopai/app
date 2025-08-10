"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
   Tipos
============================================================ */
type RegistroSala = {
    id: number | string;
    sala: string;
    nome_completo: string;
    horario_inicio?: string;
    horario_termino?: string;
    data_sepultamento?: string;
    horario_sepultamento?: string;
    local_sepultamento?: string;
};

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

/* ============================================================
   Página
============================================================ */
export default function AtendimentoPage() {
    // ----------------- Multi-step -----------------
    const TOTAL_STEPS = 11; // 0..10
    const [step, setStep] = useState(0);

    // Refs para os campos (mantém simples e alinhado ao formulário original)
    const refSala = useRef<HTMLSelectElement>(null);
    const refNome = useRef<HTMLInputElement>(null);
    const refFoto = useRef<HTMLInputElement>(null);
    const refLocalVelorio = useRef<HTMLInputElement>(null);
    const refDataSep = useRef<HTMLInputElement>(null);
    const refHoraSep = useRef<HTMLInputElement>(null);
    const refLocalSep = useRef<HTMLInputElement>(null);
    const refDataVelorio = useRef<HTMLInputElement>(null);
    const refHoraInicio = useRef<HTMLInputElement>(null);
    const refDataFim = useRef<HTMLInputElement>(null);
    const refHoraTermino = useRef<HTMLInputElement>(null);

    const [respMsg, setRespMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const showPrev = step > 0;
    const showNext = step < TOTAL_STEPS - 1;
    const showSubmit = step === TOTAL_STEPS - 1;

    const moveStep = (delta: number) => {
        setStep((s) => Math.min(Math.max(0, s + delta), TOTAL_STEPS - 1));
    };

    const salvarInformacoes = useCallback(async () => {
        const sala = refSala.current?.value ?? "";
        const nome = refNome.current?.value ?? "";
        const localVelorio = refLocalVelorio.current?.value ?? "";
        const dataSepultamento = refDataSep.current?.value ?? "";
        const horarioSepultamento = refHoraSep.current?.value ?? "";
        const localSepultamento = refLocalSep.current?.value ?? "";
        const dataVelorio = refDataVelorio.current?.value ?? "";
        const horarioInicio = refHoraInicio.current?.value ?? "";
        const dataFim = refDataFim.current?.value ?? "";
        const horarioTermino = refHoraTermino.current?.value ?? "";
        const fotoFalecido = refFoto.current?.files?.[0] ?? null;

        const formData = new FormData();
        formData.append("sala", sala);
        formData.append("nome", nome);
        formData.append("localVelorio", localVelorio);
        formData.append("dataSepultamento", dataSepultamento);
        formData.append("horarioSepultamento", horarioSepultamento);
        formData.append("localSepultamento", localSepultamento);
        formData.append("dataVelorio", dataVelorio);
        formData.append("horarioInicio", horarioInicio);
        formData.append("dataFim", dataFim);
        formData.append("horarioTermino", horarioTermino);
        if (fotoFalecido) formData.append("foto_falecido", fotoFalecido);

        try {
            const res = await fetch("/api/php/salvarDados.php", { method: "POST", body: formData });
            const data = await res.json();
            if (data?.success) {
                setRespMsg({ text: "Atendimento Criado Com Sucesso!", ok: true });
                carregarDados(); // atualiza a tabela
            } else {
                setRespMsg({ text: "Erro ao Criar o Atendimento", ok: false });
            }
        } catch (e) {
            setRespMsg({ text: "Erro ao Criar o Atendimento", ok: false });
        }
    }, []);

    // ----------------- Tabela / Edição -----------------
    const [linhas, setLinhas] = useState<RegistroSala[]>([]);
    const [errEdicao, setErrEdicao] = useState<string | null>(null);

    const carregarDados = useCallback(async () => {
        try {
            const res = await fetch("/api/php/salaControle.php?action=listar&_=" + Date.now());
            if (!res.ok) throw new Error(res.statusText);
            const data = (await res.json()) as RegistroSala[];
            setLinhas(Array.isArray(data) ? data : []);
            setErrEdicao(null);
        } catch (e: any) {
            setErrEdicao("Erro ao carregar dados. Verifique o console para detalhes.");
            // eslint-disable-next-line no-console
            console.error("Erro ao carregar dados:", e);
        }
    }, []);

    // Edição (popup)
    const [editOpen, setEditOpen] = useState(false);
    const [edit, setEdit] = useState<RegistroSala | null>(null);

    const abrirEditar = useCallback(async (id: number | string) => {
        try {
            const res = await fetch(`/api/php/salaControle.php?action=consultar&id=${id}&_=${Date.now()}`);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            setEdit({
                id: data.id,
                sala: data.sala ?? "",
                nome_completo: data.nome_completo ?? "",
                horario_inicio: data.horario_inicio ?? "",
                horario_termino: data.horario_termino ?? "",
                data_sepultamento: data.data_sepultamento ?? "",
                horario_sepultamento: data.horario_sepultamento ?? "",
                local_sepultamento: data.local_sepultamento ?? "",
            });
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
            const payload = {
                id: edit.id,
                sala: edit.sala,
                nome_completo: edit.nome_completo,
                horario_inicio: edit.horario_inicio,
                horario_termino: edit.horario_termino,
                data_sepultamento: edit.data_sepultamento,
                horario_sepultamento: edit.horario_sepultamento,
                local_sepultamento: edit.local_sepultamento,
            };
            const res = await fetch("/api/php/salaControle.php?action=editar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            });
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            if (data?.success) {
                setEditOpen(false);
                setEdit(null);
                carregarDados();
            } else {
                alert("Erro ao salvar edição: " + (data?.message || "Desconhecido"));
            }
        } catch (e: any) {
            setErrEdicao("Erro ao salvar edição. Verifique o console para detalhes.");
            console.error("Erro ao salvar edição:", e);
        }
    }, [edit, carregarDados]);

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
            const res = await fetch(`/api/php/salaControle.php?action=excluir&id=${delId}&_=${Date.now()}`, {
                method: "DELETE",
                cache: "no-store",
            });
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            if (data?.success) {
                setDelOpen(false);
                setDelId(null);
                carregarDados();
            } else {
                alert("Erro ao excluir registro: " + (data?.message || "Desconhecido"));
            }
        } catch (e: any) {
            setErrEdicao("Erro ao excluir registro. Verifique o console para detalhes.");
            console.error("Erro ao excluir registro:", e);
        }
    }, [delId, carregarDados]);

    // Polling/Inicialização
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
                {/* Step 0 */}
                {step === 0 && (
                    <section className="step active">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="sala" className="text-sm font-medium">
                                Escolha a Sala:
                            </label>
                            <select
                                id="sala"
                                name="sala"
                                ref={refSala}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                defaultValue="Sala 01"
                            >
                                <option value="Sala 01">Sala 01</option>
                                <option value="Sala 02">Sala 02</option>
                                <option value="Sala 03">Sala 03</option>
                            </select>
                        </fieldset>
                    </section>
                )}

                {/* Step 1 */}
                {step === 1 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="nome" className="text-sm font-medium">
                                Nome Completo:
                            </label>
                            <input
                                type="text"
                                id="nome"
                                name="nome"
                                placeholder="Digite o nome completo"
                                required
                                ref={refNome}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 2 */}
                {step === 2 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="foto-falecido" className="text-sm font-medium">
                                Foto do Falecido:
                            </label>
                            <input
                                type="file"
                                id="foto-falecido"
                                name="foto_falecido"
                                accept="image/*"
                                required
                                ref={refFoto}
                                className="w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 3 */}
                {step === 3 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="local-velorio" className="text-sm font-medium">
                                Local do Velório:
                            </label>
                            <input
                                type="text"
                                id="local-velorio"
                                name="local_velorio"
                                defaultValue="Memorial Senhor do Bonfim"
                                required
                                ref={refLocalVelorio}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 4 */}
                {step === 4 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="data-sepultamento" className="text-sm font-medium">
                                Data do Sepultamento:
                            </label>
                            <input
                                type="date"
                                id="data-sepultamento"
                                name="data_sepultamento"
                                required
                                ref={refDataSep}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 5 */}
                {step === 5 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="horario-sepultamento" className="text-sm font-medium">
                                Horário do Sepultamento:
                            </label>
                            <input
                                type="time"
                                id="horario-sepultamento"
                                name="horario_sepultamento"
                                required
                                ref={refHoraSep}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 6 */}
                {step === 6 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="local-sepultamento" className="text-sm font-medium">
                                Local do Sepultamento:
                            </label>
                            <input
                                type="text"
                                id="local-sepultamento"
                                name="local_sepultamento"
                                required
                                ref={refLocalSep}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 7 */}
                {step === 7 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="data-velorio" className="text-sm font-medium">
                                Data Inicio (Velório):
                            </label>
                            <input
                                type="date"
                                id="data-velorio"
                                name="data_velorio"
                                required
                                ref={refDataVelorio}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 8 */}
                {step === 8 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="horario-inicio" className="text-sm font-medium">
                                Horário de Início (Velório):
                            </label>
                            <input
                                type="time"
                                id="horario-inicio"
                                name="horario_inicio"
                                required
                                ref={refHoraInicio}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 9 */}
                {step === 9 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="data-fim" className="text-sm font-medium">
                                Data Fim (Velório):
                            </label>
                            <input
                                type="date"
                                id="data-fim"
                                name="data_fim"
                                required
                                ref={refDataFim}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}

                {/* Step 10 */}
                {step === 10 && (
                    <section className="step">
                        <fieldset className="grid gap-2 rounded-xl border p-4">
                            <label htmlFor="horario-termino" className="text-sm font-medium">
                                Horário de Término (Velório):
                            </label>
                            <input
                                type="time"
                                id="horario-termino"
                                name="horario_termino"
                                required
                                ref={refHoraTermino}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                            />
                        </fieldset>
                    </section>
                )}
            </div>

            {/* Mensagem de resposta */}
            {respMsg && (
                <TextFeedback kind={respMsg.ok ? "success" : "error"}>{respMsg.text}</TextFeedback>
            )}

            {/* Botões */}
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
                {showSubmit && (
                    <button
                        type="button"
                        onClick={salvarInformacoes}
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                    >
                        Salvar Informações
                    </button>
                )}
            </div>

            {/* --- ÁREA DE PERSONALIZAÇÃO / EDIÇÃO --- */}
            <h1 className="mt-9 text-2xl font-semibold">Edição de Dados</h1>
            {errEdicao && <div className="mt-2 text-sm text-red-600">{errEdicao}</div>}

            <div className="mt-3 overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm" id="salaTable">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Sala</th>
                            <th className="px-3 py-2 text-left font-semibold">Nome Completo</th>
                            <th className="w-48 px-3 py-2 text-left font-semibold">Ações</th>
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
                                <td className="px-3 py-2">{item.sala}</td>
                                <td className="px-3 py-2">{item.nome_completo}</td>
                                <td className="px-3 py-2">
                                    <div className="flex gap-2">
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

                    <div>
                        <label className="mb-1 block text-sm font-medium">Sala</label>
                        <select
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={edit?.sala ?? ""}
                            onChange={(e) => setEdit((v) => (v ? { ...v, sala: e.target.value } : v))}
                        >
                            <option value="Sala 01">Sala 01</option>
                            <option value="Sala 02">Sala 02</option>
                            <option value="Sala 03">Sala 03</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium">Nome Completo</label>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={edit?.nome_completo ?? ""}
                            onChange={(e) =>
                                setEdit((v) => (v ? { ...v, nome_completo: e.target.value } : v))
                            }
                        />
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

                    <div className="mt-2 flex justify-end gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditOpen(false)}>
                            Cancelar
                        </button>
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
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
