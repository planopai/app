"use client";
import React from "react";
import Modal from "./Modal";
import { ArrumacaoState, Registro } from "./types";

export default function ArrumacaoModal({
    open,
    setOpen,
    arrumacao,
    setArrumacao,
    setWizardData,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    arrumacao: ArrumacaoState;
    setArrumacao: React.Dispatch<React.SetStateAction<ArrumacaoState>>;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
}) {
    const campos: { key: keyof ArrumacaoState; label: string }[] = [
        { key: "luvas", label: "Luvas" },
        { key: "palha", label: "Palha" },
        { key: "tamponamento", label: "Tamponamento" },
        { key: "maquiagem", label: "Maquiagem" },
        { key: "algodao", label: "Algodão" },
        { key: "cordao", label: "Cordão" },
        { key: "barba", label: "Barba" },
    ];

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Arrumação do Corpo" maxWidth={520}>
            <h3 className="text-lg font-semibold">Arrumação do Corpo</h3>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.map((o) => (
                    <label key={o.key} className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={!!arrumacao[o.key]}
                            onChange={(e) => setArrumacao((prev) => ({ ...prev, [o.key]: e.target.checked }))}
                        />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                    Cancelar
                </button>
                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    onClick={() => {
                        setWizardData((d: Registro) => ({ ...d, arrumacao }));
                        setOpen(false);
                    }}
                >
                    Salvar Arrumação
                </button>
            </div>
        </Modal>
    );
}
