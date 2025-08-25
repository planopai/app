"use client";
import React, { useMemo } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases } from "./constants";
import { acaoToStatus, isTanatoNo } from "./helpers";
import { salasMemorial, } from "./constants";
import { proximaFaseDoRegistro } from "./helpers";

export default function AcaoModal({
    open,
    setOpen,
    registros,
    acaoId,
    registrarAcao,
    acaoMsg,
    acaoSubmitting,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    registros: Registro[];
    acaoId: Registro["id"] | null | undefined;
    registrarAcao: (acao: string) => Promise<void>;
    acaoMsg: { text: string; ok: boolean } | null;
    acaoSubmitting: boolean;
}) {
    const registroAtual = useMemo(
        () => (acaoId != null ? registros.find((x) => x.id === acaoId) : undefined),
        [acaoId, registros]
    );

    const skipConservacao = registroAtual ? isTanatoNo(registroAtual.tanato) : false;
    const skipTransportando = registroAtual
        ? salasMemorial.includes((registroAtual.local_velorio || "").trim())
        : false;

    const prox = registroAtual ? proximaFaseDoRegistro(registroAtual, fases as unknown as string[]) : null;

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fases.map((f) => {
                    if (!registroAtual) return null;
                    if (skipTransportando && f === "fase07") return null;
                    if (skipConservacao && (f === "fase03" || f === "fase04")) return null;

                    const habilitar = prox === f;
                    return (
                        <button
                            key={f}
                            type="button"
                            disabled={!habilitar || acaoSubmitting}
                            onClick={() => registrarAcao(f)}
                            className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar && !acaoSubmitting ? "hover:bg-muted" : "pointer-events-none opacity-50"
                                }`}
                            title={habilitar ? "Confirmar próxima etapa" : "Aguardando etapas anteriores"}
                        >
                            {acaoToStatus(f)}
                        </button>
                    );
                })}
            </div>

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
