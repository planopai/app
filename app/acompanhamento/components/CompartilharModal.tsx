"use client";

import React from "react";
import {
    IconShare3,
    IconX,
} from "@tabler/icons-react";

import Modal from "./Modal";
import type { Registro } from "./types";

import EnviarObituario from "./EnviarObituario";
import EnviarVelorioOnline from "./EnviarVelorioOnline";
import EnviarPortalFamilia from "./EnviarPortalFamilia";
import EnviarLegadoLuz from "./EnviarLegadoLuz";

export default function CompartilharModal({
    open,
    onClose,
    registro,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
}) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            ariaLabel="Compartilhar Atendimento"
            maxWidth={460}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/40">
                            <IconShare3 className="size-5 text-primary" />
                        </span>

                        <div>
                            <h2 className="text-xl font-semibold leading-tight">
                                Compartilhar
                            </h2>

                            <p className="mt-0.5 text-sm text-muted-foreground">
                                Escolha uma opção de envio
                            </p>
                        </div>
                    </div>

                    {registro?.falecido ? (
                        <div className="mt-4 rounded-lg border bg-card/60 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Atendimento
                            </div>

                            <div className="mt-0.5 break-words text-sm font-semibold">
                                {registro.falecido}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Nenhum atendimento selecionado.
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    onClick={onClose}
                    title="Fechar"
                    aria-label="Fechar"
                >
                    <IconX className="size-4" />
                </button>
            </div>

            <div className="mt-5 grid gap-3">
                <EnviarObituario registro={registro} />

                <EnviarVelorioOnline registro={registro} />

                <EnviarPortalFamilia registro={registro} />

                <EnviarLegadoLuz registro={registro} />
            </div>
        </Modal>
    );
}