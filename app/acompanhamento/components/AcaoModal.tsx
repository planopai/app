"use client";
import React, { useMemo } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases, salasMemorial } from "./constants";
import { acaoToStatus, isTanatoNo } from "./helpers";

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
    // Registro selecionado
    const registroAtual = useMemo(
        () => (acaoId != null ? registros.find((x) => x.id === acaoId) : undefined),
        [acaoId, registros]
    );

    const skipConservacao =
        !!registroAtual && isTanatoNo(registroAtual.tanato);
    const skipTransportando =
        !!registroAtual &&
        salasMemorial.includes((registroAtual.local_velorio || "").trim());

    // 1) Fases visíveis (aplica os "skips" uma única vez)
    // Nota: NÃO fazemos cast para string[] — usamos o tipo readonly corretamente.
    const fasesVisiveis = useMemo<Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao]
    );

    // 2) Próxima fase baseada nas fases visíveis
    const prox = useMemo<Fase | null>(() => {
        if (!registroAtual) return null;
        const atual = ((registroAtual.status as Fase | undefined) ?? "fase00") as Fase;
        const idxAtual = fasesVisiveis.indexOf(atual);
        if (idxAtual >= 0) return fasesVisiveis[idxAtual + 1] ?? null;
        // Se o status atual não estiver listado (ex.: "fase00"), começa pela primeira visível
        return fasesVisiveis[0] ?? null;
    }, [registroAtual, fasesVisiveis]);

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fasesVisiveis.map((f) => {
                    if (!registroAtual) return null;
                    const habilitar = prox === f;
                    return (
                        <button
                            key={f}
                            type="button"
                            disabled={!habilitar || acaoSubmitting}
                            onClick={() => registrarAcao(f)}
                            className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar && !acaoSubmitting
                                    ? "hover:bg-muted"
                                    : "pointer-events-none opacity-50"
                                }`}
                            title={
                                habilitar
                                    ? "Confirmar próxima etapa"
                                    : "Aguardando etapas anteriores"
                            }
                        >
                            {acaoToStatus(f)}
                        </button>
                    );
                })}
            </div>

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>
                    {acaoMsg.text}
                </TextFeedback>
            )}
        </Modal>
    );
}
