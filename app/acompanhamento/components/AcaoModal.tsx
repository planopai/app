"use client";
import React, { useMemo } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases, salasMemorial } from "./constants";
import { acaoToStatus, isTanatoNo } from "./helpers";

// Tipo da fase derivado do tuple "fases"
type Fase = (typeof fases)[number];

/** Dado o status atual (ou fase00), as fases visíveis e o array completo,
 *  retorna a próxima fase visível mais à frente no array completo. */
function calcularProximaFase(
    statusAtual: Fase | undefined,
    fasesVisiveis: readonly Fase[],
    fasesTodas: readonly Fase[]
): Fase | null {
    const atual: Fase = (statusAtual ?? "fase00") as Fase;

    // Índice base no array completo; se não existir, começamos antes do início
    const idxAtualNoAll = fasesTodas.indexOf(atual);
    const idxBase = idxAtualNoAll >= 0 ? idxAtualNoAll : -1;

    // A próxima fase visível cuja posição no array completo seja maior que a atual
    const proxima = fasesVisiveis.find((f) => fasesTodas.indexOf(f) > idxBase) ?? null;
    return proxima;
}

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
    // 1) Registro selecionado — se não houver, não renderize os botões
    const registroAtual = useMemo(
        () => (acaoId != null ? registros.find((x) => x.id === acaoId) : undefined),
        [acaoId, registros]
    );

    // 2) Skips
    const skipConservacao = !!registroAtual && isTanatoNo(registroAtual.tanato);
    const skipTransportando =
        !!registroAtual && salasMemorial.includes((registroAtual.local_velorio || "").trim());

    // 3) Fases visíveis (aplica os skips uma única vez)
    const fasesVisiveis = useMemo<readonly Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao]
    );

    // 4) Próxima fase baseada no índice do array completo
    const prox = useMemo<Fase | null>(() => {
        if (!registroAtual) return null;
        return calcularProximaFase(
            (registroAtual.status as Fase | undefined) ?? ("fase00" as Fase),
            fasesVisiveis,
            fases as readonly Fase[]
        );
    }, [registroAtual, fasesVisiveis]);

    // --- Render ---
    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            {/* Sem registro -> mensagem clara */}
            {!registroAtual && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado. Selecione um registro para continuar.
                </p>
            )}

            {/* Se há registro mas não há fases visíveis -> informe a situação */}
            {registroAtual && fasesVisiveis.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhuma etapa disponível para este registro com as condições atuais.
                </p>
            )}

            {/* Grid de botões somente quando há registro e alguma fase visível */}
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

                    {/* Fluxo concluído (já está na última fase visível) */}
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
