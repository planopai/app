"use client";

import React from "react";
import Modal from "./Modal";
import { MateriaisState, Registro } from "./types";
import { materiaisConfig } from "./constants";

export default function MateriaisModal({
    open,
    setOpen,
    materiais,
    setMateriais,
    setWizardData,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    materiais: MateriaisState;
    setMateriais: React.Dispatch<React.SetStateAction<MateriaisState>>;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
}) {
    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Materiais" maxWidth={560}>
            <h3 className="text-lg font-semibold">Materiais para Assistência</h3>

            <div className="mt-4 space-y-3">
                {materialsRows({ materiais, setMateriais })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={() => setOpen(false)}
                >
                    Cancelar
                </button>
                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    onClick={() => {
                        setWizardData((d) => ({ ...d, materiais }));
                        setOpen(false);
                    }}
                >
                    Salvar Materiais
                </button>
            </div>
        </Modal>
    );
}

function materialsRows({
    materiais,
    setMateriais,
}: {
    materiais: MateriaisState;
    setMateriais: React.Dispatch<React.SetStateAction<MateriaisState>>;
}) {
    return materiaisConfig.map((m) => {
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
    });
}
