"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";

type Step = {
    label: string;
    id: string;
    type: "input" | "select" | "textarea" | "date" | "time" | "datalist" | "custom";
    options?: string[];
    placeholder?: string;
    datalist?: string[];
};

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
}) {
    // ✅ controle local só para visibilidade do "Tipo de Ornamentação"
    const [ornamentacaoVal, setOrnamentacaoVal] = useState<string>("");

    useEffect(() => {
        setOrnamentacaoVal(String(wizardData.ornamentacao ?? ""));
    }, [open, wizardData.ornamentacao]);

    const grupoIndices = wizardStepIndexes[wizardStep] || [];
    const grupoSteps = useMemo(() => grupoIndices.map((i) => steps[i]), [grupoIndices, steps]);

    const isLastStep = wizardStep === wizardStepIndexes.length - 1;
    const isRestrito = typeof wizardRestrictGroup === "number";

    const goPrev = () => setWizardStep(Math.max(0, wizardStep - 1));
    const goNext = () => {
        const ok = salvarGrupoWizard();
        if (!ok) return;
        if (!isLastStep) setWizardStep(wizardStep + 1);
    };

    const isRequired = (id: string) => obrigatorios.includes(id);

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Wizard" maxWidth={740}>
            <h2 className="text-xl font-semibold">{wizardTitle}</h2>

            {/* Abas informativas */}
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
                    // 👉 mostra "Tipo de Ornamentação" somente quando Ornamentação = "Sim"
                    if (step.id === "ornamentacao_tipo" && ornamentacaoVal !== "Sim") {
                        return null;
                    }

                    // Campo custom (abre Arrumação)
                    if (step.type === "custom" && step.id === "arrumacao") {
                        return (
                            <div key={step.id} className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                                    <button
                                        type="button"
                                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={() => setArrumacaoOpen(true)}
                                    >
                                        Selecionar Materiais
                                    </button>
                                    <span className="text-sm text-muted-foreground">
                                        {arrumacaoSelecionadaResumo || "Nenhum item selecionado"}
                                    </span>
                                </div>
                                <input id="wizard-arrumacao" type="hidden" defaultValue="__custom__" />
                            </div>
                        );
                    }

                    // Assistência (com Materiais)
                    if (step.id === "assistencia" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={assistenciaVal}
                                    onChange={(e) => setAssistenciaVal(e.target.value)}
                                >
                                    {(step.options || ["", "Sim", "Não"]).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>

                                {assistenciaVal === "Sim" && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                                            onClick={() => setMateriaisOpen(true)}
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

                    // Tanato
                    if (step.id === "tanato" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">
                                    {step.label}
                                    {isRequired(step.id) && <span className="text-red-600"> *</span>}
                                </label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={tanatoVal}
                                    onChange={(e) => setTanatoVal(e.target.value)}
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

                    // Ornamentação (controla "tipo")
                    if (step.id === "ornamentacao" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <select
                                    id={`wizard-${step.id}`}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={ornamentacaoVal}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setOrnamentacaoVal(v);
                                        if (v !== "Sim") {
                                            const el = document.getElementById(
                                                "wizard-ornamentacao_tipo"
                                            ) as HTMLSelectElement | null;
                                            if (el) el.value = "";
                                        }
                                    }}
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

                    // Tipo de Ornamentação (aparece só quando Sim)
                    if (step.id === "ornamentacao_tipo" && step.type === "select") {
                        return (
                            <div key={step.id}>
                                <label className="mb-1 block text-sm font-medium">{step.label}</label>
                                <select
                                    id="wizard-ornamentacao_tipo"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    defaultValue={String(wizardData.ornamentacao_tipo ?? "")}
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

                    // Campos básicos
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    rows={3}
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    defaultValue={String((wizardData as any)[step.id] ?? "")}
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
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
                                    className="w-full rounded-md border px-3 py-2 text-sm"
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

            {/* Rodapé */}
            <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                    {isRestrito && (
                        <>Editando apenas: <b>{wizardStepTitles[wizardRestrictGroup!]}</b></>
                    )}
                </div>

                <div className="flex gap-2">
                    <button className="rounded-md border px-3 py-2 text-sm" onClick={onClose}>
                        Cancelar
                    </button>

                    {/* ✅ QUANDO EDITAR UM ÚNICO GRUPO: exibe apenas SALVAR */}
                    {isRestrito ? (
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                            onClick={concluirWizard}
                        >
                            Salvar
                        </button>
                    ) : (
                        <>
                            {wizardStep > 0 && (
                                <button className="rounded-md border px-3 py-2 text-sm" onClick={goPrev}>
                                    Anterior
                                </button>
                            )}
                            {isLastStep ? (
                                <button
                                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                                    onClick={concluirWizard}
                                >
                                    Concluir
                                </button>
                            ) : (
                                <button
                                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                                    onClick={goNext}
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
