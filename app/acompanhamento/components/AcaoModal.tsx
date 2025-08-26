"use client";
import React, { useMemo } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases, salasMemorial } from "./constants";
import { acaoToStatus, isTanatoNo, proximaFaseDoRegistro } from "./helpers";

// Tipo da fase derivado do tuple "fases"
type Fase = (typeof fases)[number];

/** Mapa de rótulo -> código da fase (caso o backend envie rótulos como "Velando") */
const ROTULO_PARA_FASE: Record<string, Fase> = {
    // ajuste conforme seus rótulos reais
    "Removendo": "fase01",
    "Aguardando Procedimento": "fase02",
    "Preparando": "fase03",
    "Aguardando Ornamentação": "fase04",
    "Ornamentando": "fase05",
    "Corpo Pronto": "fase06",
    "Transportando": "fase07",
    "Velando": "fase08",
    "Sepultando": "fase09",
    "Sepultamento Concluído": "fase10",
    "Material Recolhido": "fase11",
    // se houver outros rótulos equivalentes, adicione-os aqui
};

/** Garante que sempre trabalharemos com o CÓDIGO da fase (ex.: "fase08") */
function normalizarStatus(status?: string): Fase | undefined {
    if (!status) return undefined;
    if (status.startsWith("fase")) return status as Fase;
    return ROTULO_PARA_FASE[status] ?? undefined;
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
    // 1) Registro selecionado — já normalizando o status para "faseXX"
    const registroAtual = useMemo(() => {
        const r = acaoId != null ? registros.find((x) => x.id === acaoId) : undefined;
        if (!r) return undefined;
        const statusNormalizado = normalizarStatus(r.status) ?? ("fase00" as Fase);
        return { ...r, status: statusNormalizado } as Registro & { status: Fase };
    }, [acaoId, registros]);

    // 2) Skips (iguais aos usados para montar fasesVisiveis)
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

    // 4) Próxima fase calculada pela mesma função usada no helpers (fonte única)
    const prox = useMemo<Fase | null>(() => {
        if (!registroAtual) return null;

        // Usa a função do helpers que já respeita ordem e skips
        const proxima = proximaFaseDoRegistro(
            {
                status: (registroAtual.status as string) ?? "fase00",
                local_velorio: registroAtual.local_velorio,
                tanato: registroAtual.tanato,
            },
            fases as readonly string[]
        ) as Fase | null;

        return proxima;
    }, [registroAtual]);

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
