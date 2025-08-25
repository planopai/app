"use client";
import React from "react";
import Modal from "./Modal";
import { wizardStepTitles } from "./constants";

export default function InfoModal({
    open,
    setOpen,
    infoIdx,
    abrirWizard,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    infoIdx: number | null;
    abrirWizard: (tipo: "novo" | "editar", idx?: number | null, grupoStep?: number | null) => void;
}) {
    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Info" maxWidth={410}>
            <h2 className="text-xl font-semibold">Informações do Registro</h2>
            <div className="mt-4 grid gap-2">
                {wizardStepTitles.map((t, i) => (
                    <button
                        key={t}
                        className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
                        onClick={() => {
                            setOpen(false);
                            if (infoIdx != null) abrirWizard("editar", infoIdx, i);
                        }}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </Modal>
    );
}
