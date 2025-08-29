"use client";
import React from "react";
import Modal from "./Modal";
import FieldLabel from "./FieldLabel";
import TextFeedback from "./TextFeedback";

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
    setWizardStep: React.Dispatch<React.SetStateAction<number>>;
    wizardRestrictGroup: number | null;
    wizardData: any;
    setWizardData: React.Dispatch<React.SetStateAction<any>>;
    obrigatorios: string[];
    steps: readonly any[];
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
    salvarGrupoWizard: () => any | null;
    concluirWizard: () => Promise<void>;
}) {
    return (
        <Modal open={open} onClose={onClose} ariaLabel="Novo registro">
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

                        // 🔸 PASSO ESPECIAL: ARRUMAÇÃO DO CORPO (sempre disponível e independente)
                        if (s.id === "arrumacao") {
                            return (
                                <div key={id}>
                                    <FieldLabel>{s.label}</FieldLabel>

                                    {/* Resumo em texto (somente leitura) */}
                                    <div className="text-xs text-muted-foreground mb-2">
                                        {arrumacaoSelecionadaResumo
                                            ? <>Selecionados (Arrumação): {arrumacaoSelecionadaResumo}</>
                                            : "Nenhum item selecionado"}
                                    </div>

                                    {/* Botão para abrir o modal */}
                                    <button
                                        type="button"
                                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        onClick={() => setArrumacaoOpen(true)}
                                        title="Arrumação do Corpo"
                                    >
                                        Selecionar Itens
                                    </button>
                                </div>
                            );
                        }

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
                                                <button
                                                    type="button"
                                                    className="whitespace-nowrap rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                                    onClick={() => setMateriaisOpen(true)}
                                                    title="Selecionar materiais"
                                                >
                                                    Materiais
                                                </button>
                                            )}
                                        </div>

                                        {(assistenciaVal || val) === "Sim" && materiaisSelecionadosResumo && (
                                            <div className="mt-2 text-xs text-muted-foreground">
                                                Selecionados (Materiais): {materiaisSelecionadosResumo}
                                            </div>
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

                        // 🔸 Default para textarea (OBSERVAÇÕES etc.) — nunca cai aqui para "arrumacao"
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
                                const ok = salvarGrupoWizard();
                                if (ok) setWizardStep((s) => Math.min(s + 1, wizardStepIndexes.length - 1));
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
                        {wizardRestrictGroup == null && wizardStep === wizardStepIndexes.length - 1
                            ? "Concluir"
                            : "Salvar"}
                    </button>
                </div>

                <div className="mt-2 text-sm opacity-80">
                    {wizardRestrictGroup != null
                        ? `Editar: ${wizardStepTitles[wizardStep]}`
                        : `Etapa ${wizardStep + 1} de ${wizardStepTitles.length}: ${wizardStepTitles[wizardStep]}`}
                </div>
            </form>
        </Modal>
    );
}
