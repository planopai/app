"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases, salasMemorial } from "./constants";
import {
    acaoToStatus,
    isTanatoNo,
    proximaFaseDoRegistro,
    normalizarStatus,
    consultarStatusAtual,
} from "./helpers";

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
    // ---------- Estado vindo do backend ----------
    const [loadingOnline, setLoadingOnline] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [online, setOnline] = useState<{
        id: string;
        status: Fase;
        local_velorio: string;
        tanato: string;
    } | null>(null);

    // Busca SEMPRE o status atual no backend ao abrir/trocar acaoId
    useEffect(() => {
        let cancel = false;

        async function run() {
            setOnline(null);
            setOnlineError(null);
            if (!open || !acaoId) return;

            setLoadingOnline(true);
            try {
                const s = await consultarStatusAtual(acaoId);
                if (cancel) return;
                const statusFix = (normalizarStatus(s.status) ?? "fase00") as Fase;
                setOnline({
                    id: String(s.id ?? acaoId),
                    status: statusFix,
                    local_velorio: s.local_velorio || "",
                    tanato: s.tanato || "",
                });
            } catch (e: any) {
                if (!cancel) setOnlineError(e?.message || "Falha ao consultar status.");
            } finally {
                if (!cancel) setLoadingOnline(false);
            }
        }

        run();
        return () => {
            cancel = true;
        };
    }, [open, acaoId]);

    // Dados efetivos usados na UI: **sempre** do backend
    const efetivo = useMemo(() => {
        if (!online) return null;
        return {
            status: online.status as Fase,
            local_velorio: online.local_velorio,
            tanato: online.tanato,
        };
    }, [online]);

    // Skips (iguais aos usados no cálculo/regra de negócio)
    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipTransportando =
        !!efetivo && salasMemorial.includes((efetivo.local_velorio || "").trim());

    // Fases visíveis (aplica os skips) — mantém a fase atual visível só para referência
    const fasesVisiveis = useMemo<readonly Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (efetivo && f === efetivo.status) return true; // mantemos para referência visual
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao, efetivo]
    );

    // Calcula **sempre** a próxima fase a partir do status atual do backend
    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];

        // 1) tenta via helper com a lista visível
        let p = proximaFaseDoRegistro(
            {
                status: (efetivo.status as string) ?? "fase00",
                local_velorio: efetivo.local_velorio,
                tanato: efetivo.tanato,
            },
            visiveis as readonly string[]
        ) as Fase | null;

        if (p) return p;

        // 2) fallback: acha a próxima fase no fluxo completo que esteja nas visíveis
        const idxAtual = fluxoCompleto.indexOf(efetivo.status as Fase);
        if (idxAtual === -1) return null;

        for (let i = idxAtual + 1; i < fluxoCompleto.length; i++) {
            const candidato = fluxoCompleto[i];
            if (visiveis.includes(candidato)) return candidato;
        }
        return null; // sem próxima (não renderizamos mensagem de 'concluído')
    }, [efetivo, fasesVisiveis]);

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Registrar uma ação</h2>
                {efetivo && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        status atual (backend): {String(efetivo.status)}
                    </span>
                )}
            </div>

            {/* Status de sincronização */}
            <div className="mt-2 text-xs text-muted-foreground">
                {loadingOnline && "Sincronizando status com o servidor…"}
                {!loadingOnline && online && !onlineError && "Status sincronizado com o servidor."}
                {!loadingOnline && onlineError && (
                    <span className="text-red-600">
                        {onlineError} — tente novamente.
                    </span>
                )}
            </div>

            {!efetivo && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado ou sem dados do servidor.
                </p>
            )}

            {efetivo && (
                <>
                    {/* ÚNICO botão: a PRÓXIMA etapa do status atual do backend */}
                    {prox ? (
                        <div className="mt-4">
                            <button
                                type="button"
                                disabled={acaoSubmitting || loadingOnline}
                                onClick={() => registrarAcao(prox)}
                                className={`rounded-md border px-4 py-3 text-sm font-medium ${!acaoSubmitting && !loadingOnline ? "hover:bg-muted" : "opacity-50 pointer-events-none"
                                    }`}
                                title="Confirmar próxima etapa"
                            >
                                {acaoToStatus(prox)}
                            </button>
                        </div>
                    ) : (
                        // Sem próxima etapa aplicável -> não mostramos “fluxo concluído” nem nada
                        <div className="mt-4 text-xs text-muted-foreground">
                            {/* intencionalmente em branco/baixo ruído */}
                            {/* Se quiser, pode colocar algo discreto como: "Sem próxima etapa aplicável no momento." */}
                        </div>
                    )}
                </>
            )}

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
