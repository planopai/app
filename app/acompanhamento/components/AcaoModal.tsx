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

// Fase final: 'material recolhido' => 'fase11'
const FASE_FINAL = "fase11" as Fase;

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
    // ---------- 1) Registro local (frontend) ----------
    const registroLocal = useMemo(() => {
        const r =
            acaoId != null ? registros.find((x) => String(x.id) === String(acaoId)) : undefined;
        if (!r) return undefined;
        const statusFix = (normalizarStatus(r.status) ?? "fase00") as Fase;
        return { ...r, status: statusFix } as Registro & { status: Fase };
    }, [acaoId, registros]);

    // ---------- 2) Estado "online" vindo do backend ----------
    const [loadingOnline, setLoadingOnline] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [online, setOnline] = useState<{
        id: string;
        status: Fase;
        local_velorio: string;
        tanato: string;
    } | null>(null);

    // Busca o status atual direto do PHP quando abrir/mudar acaoId
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
                // normaliza para Fase
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

    // Dados efetivos usados na UI (prefere online; cai para local)
    // ✅ Se veio "online", usa ele SEM checar igualdade de id (evita travar quando o backend retorna outro id).
    const efetivo = useMemo(() => {
        if (online) {
            return {
                status: online.status as Fase,
                local_velorio: online.local_velorio,
                tanato: online.tanato,
            };
        }
        if (registroLocal) {
            return {
                status: (registroLocal.status as Fase) ?? ("fase00" as Fase),
                local_velorio: registroLocal.local_velorio,
                tanato: registroLocal.tanato,
            };
        }
        return null;
    }, [online, registroLocal]);

    // Skips (iguais aos usados no cálculo)
    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipTransportando =
        !!efetivo && salasMemorial.includes((efetivo.local_velorio || "").trim());

    // Fases visíveis (aplica os skips uma única vez)
    // ⚠️ Nunca esconda a fase que é o status atual (para não perder referência do fluxo)
    const fasesVisiveis = useMemo<readonly Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (efetivo && f === efetivo.status) return true; // mantém visível a fase atual
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao, efetivo]
    );

    // Próxima fase calculada — robusta
    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];

        // Se já está na fase final, não há próxima
        if (efetivo.status === FASE_FINAL) return null;

        // 1) tenta via helper com as fases visíveis
        let p = proximaFaseDoRegistro(
            {
                status: (efetivo.status as string) ?? "fase00",
                local_velorio: efetivo.local_velorio,
                tanato: efetivo.tanato,
            },
            visiveis as readonly string[]
        ) as Fase | null;

        if (p) return p;

        // 2) fallback: caminha no fluxo completo até achar a próxima fase visível
        const idxAtual = fluxoCompleto.indexOf(efetivo.status as Fase);
        if (idxAtual === -1) return null;

        for (let i = idxAtual + 1; i < fluxoCompleto.length; i++) {
            const candidato = fluxoCompleto[i];
            if (visiveis.includes(candidato)) {
                return candidato;
            }
        }
        return null;
    }, [efetivo, fasesVisiveis]);

    // Está concluído somente se a fase atual for a fase final (fase11)
    const concluido = !!efetivo && efetivo.status === FASE_FINAL;

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            {/* Linha de status de sincronização */}
            <div className="mt-2 text-xs text-muted-foreground">
                {loadingOnline && "Sincronizando status com o servidor…"}
                {!loadingOnline && online && !onlineError && "Status sincronizado com o servidor."}
                {!loadingOnline && onlineError && (
                    <span className="text-red-600">
                        {onlineError} — exibindo dados locais como fallback.
                    </span>
                )}
            </div>

            {!efetivo && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado. Selecione um registro para continuar.
                </p>
            )}

            {efetivo && fasesVisiveis.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhuma etapa disponível para este registro com as condições atuais.
                </p>
            )}

            {efetivo && fasesVisiveis.length > 0 && (
                <>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {fasesVisiveis.map((f) => {
                            const habilitar = prox === f && !acaoSubmitting && !loadingOnline && !concluido;
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

                    {/* Só exibe "concluído" quando realmente estiver na fase11 */}
                    {concluido && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            Fluxo concluído para este registro.
                        </p>
                    )}
                </>
            )}

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
