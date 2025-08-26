"use client";

import React, { useMemo } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases, salasMemorial } from "./constants";
import { acaoToStatus, isTanatoNo, proximaFaseDoRegistro, normalizarStatus } from "./helpers";

// Tipo da fase derivado do tuple "fases"
type Fase = (typeof fases)[number];

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
    // Registro selecionado — já normalizando o status para "faseXX"
    const registroAtual = useMemo(() => {
        const r = acaoId != null ? registros.find((x) => String(x.id) === String(acaoId)) : undefined;
        if (!r) return undefined;
        const statusFix = (normalizarStatus(r.status) ?? "fase00") as Fase;
        return { ...r, status: statusFix } as Registro & { status: Fase };
    }, [acaoId, registros]);

    // Skips (iguais aos usados no cálculo)
    const skipConservacao = !!registroAtual && isTanatoNo(registroAtual.tanato);
    const skipTransportando =
        !!registroAtual && salasMemorial.includes((registroAtual.local_velorio || "").trim());

    // Fases visíveis (aplica os skips uma única vez)
    const fasesVisiveis = useMemo<readonly Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao]
    );

    // Próxima fase calculada pela função centralizada (helpers)
    const prox = useMemo<Fase | null>(() => {
        if (!registroAtual) return null;
        return proximaFaseDoRegistro(
            {
                status: (registroAtual.status as string) ?? "fase00", // agora sempre "faseXX"
                local_velorio: registroAtual.local_velorio,
                tanato: registroAtual.tanato,
            },
            fases as readonly string[]
        ) as Fase | null;
    }, [registroAtual]);

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            {!registroAtual && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado. Selecione um registro para continuar.
                </p>
            )}

            {registroAtual && fasesVisiveis.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhuma etapa disponível para este registro com as condições atuais.
                </p>
            )}

            {registroAtual && fasesVisiveis.length > 0 && (
                <>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {fasesVisiveis.map((f) => {
                            const habilitar = prox === f && !acaoSubmitting;
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    disabled={!habilitar}
                                    onClick={() => registrarAcao(f)}
                                    className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar ? "hover:bg-muted" : "pointer-events-none opacity-50"
                                        }`}
                                    title={habilitar ? "Confirmar próxima etapa" : "Aguardando etapas anteriores"}
                                >
                                    {acaoToStatus(f)}
                                </button>
                            );
                        })}
                    </div>

                    {prox === null && (
                        <p className="mt-2 text-sm text-muted-foreground">Fluxo concluído para este registro.</p>
                    )}
                </>
            )}

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
