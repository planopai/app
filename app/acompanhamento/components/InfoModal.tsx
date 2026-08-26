"use client";

import React from "react";
import Modal from "./Modal";
import type { Registro } from "./types";

type InfoModalProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    infoIdx: number | null;

    abrirWizard: (
        tipo: "novo" | "editar",
        idx?: number | null,
        grupoStep?: number | null
    ) => void;

    /*
     * Mantidos por compatibilidade com a page.tsx atual.
     * O InfoModal voltou a exibir somente os atalhos de edição.
     */
    abrirAssinatura?: (
        idx: number,
        tipo: "recebimento" | "requisicao"
    ) => void;

    registro?: Registro | null;

    /*
     * Títulos das abas vindos da configuração do Wizard.
     *
     * Funerário normalmente:
     * 0 - Atendimento
     * 1 - Itens
     * 2 - Velório
     * 3 - Sepultamento
     *
     * Para outros tipos de atendimento, mantém os títulos
     * correspondentes enviados pela page.tsx.
     */
    wizardStepTitles: Array<string | null>;
};

export default function InfoModal({
    open,
    setOpen,
    infoIdx,
    abrirWizard,
    wizardStepTitles,
}: InfoModalProps) {
    const abrirEdicao = (grupoStep: number) => {
        if (infoIdx == null) {
            return;
        }

        setOpen(false);
        abrirWizard("editar", infoIdx, grupoStep);
    };

    return (
        <Modal
            open={open}
            onClose={() => setOpen(false)}
            ariaLabel="Informações do Registro"
            maxWidth={410}
        >
            <h2 className="text-xl font-semibold">
                Informações do Registro
            </h2>

            <div className="mt-4 grid gap-2">
                {(wizardStepTitles || []).map((titulo, index) => {
                    if (!titulo) {
                        return null;
                    }

                    return (
                        <button
                            key={`${titulo}-${index}`}
                            type="button"
                            disabled={infoIdx == null}
                            className={[
                                "w-full rounded-md border px-3 py-2",
                                "text-left text-sm",
                                "transition-colors hover:bg-muted",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            ].join(" ")}
                            onClick={() => abrirEdicao(index)}
                        >
                            {titulo}
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
}
