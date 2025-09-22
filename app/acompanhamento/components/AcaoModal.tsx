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

type OnlinePayload = {
    id: string;
    status: Fase;
    local_velorio: string;
    tanato: string;
    // campo opcional que podemos aproveitar se o PHP passar
    status_raw?: string;
};

// Componente
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
    // ---------- estado local (fallback) ----------
    const registroLocal = useMemo(() => {
        const r =
            acaoId != null ? registros.find((x) => String(x.id) === String(acaoId)) : undefined;
        if (!r) return undefined;
        const statusFix = (normalizarStatus(r.status) ?? "fase00") as Fase;
        return { ...r, status: statusFix } as Registro & { status: Fase };
    }, [acaoId, registros]);

    // ---------- estado online ----------
    const [loadingOnline, setLoadingOnline] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [online, setOnline] = useState<OnlinePayload | null>(null);

    // EXTRA: diagnóstico visível e no console
    const [diag, setDiag] = useState<{
        requestedId?: string;
        returnedId?: string;
        statusRaw?: string;
        statusNormalized?: string;
        sourceUsed?: "backend" | "local" | "none";
        skipConservacao?: boolean;
        skipTransportando?: boolean;
        fasesVisiveis?: string[];
        prox?: string | null;
    }>({});

    // Busca SEMPRE o status atual no backend ao abrir/trocar acaoId
    useEffect(() => {
        let cancel = false;

        async function run() {
            setOnline(null);
            setOnlineError(null);
            setDiag({});

            if (!open || !acaoId) return;

            const requestedId = String(acaoId);
            setLoadingOnline(true);
            try {
                const s: any = await consultarStatusAtual(acaoId); // deve retornar {id,status,local_velorio,tanato,(opcional)status_raw}
                if (cancel) return;

                const returnedId = String(s?.id ?? "");
                const raw = (s?.status_raw ?? s?.status ?? "") as string;
                const normalized = normalizarStatus(s?.status) ?? "fase00";

                // ----- Logs no console (F12)
                console.groupCollapsed(
                    "%c[AcaoModal] Resultado do backend",
                    "color:#0366d6;font-weight:bold;"
                );
                console.log("requestedId:", requestedId);
                console.log("returnedId:", returnedId);
                console.log("status_raw (se veio):", raw);
                console.log("status_normalized:", normalized);
                console.log("payload bruto:", s);
                console.groupEnd();

                // Validações: id consistente e status normalizado aceitável
                if (!returnedId || returnedId !== requestedId) {
                    setOnlineError(
                        `Inconsistência: backend retornou id="${returnedId}" diferente do solicitado id="${requestedId}".`
                    );
                    setOnline(null);
                    setDiag((d) => ({
                        ...d,
                        requestedId,
                        returnedId,
                        statusRaw: raw,
                        statusNormalized: normalized,
                        sourceUsed: "local",
                    }));
                    return;
                }

                if (!/^fase\d+$/.test(normalized)) {
                    setOnlineError(
                        `Status inválido vindo do servidor: "${String(s?.status)}" (normalizado="${normalized}").`
                    );
                    setOnline(null);
                    setDiag((d) => ({
                        ...d,
                        requestedId,
                        returnedId,
                        statusRaw: raw,
                        statusNormalized: normalized,
                        sourceUsed: "local",
                    }));
                    return;
                }

                const payload: OnlinePayload = {
                    id: returnedId,
                    status: normalized as Fase,
                    local_velorio: s?.local_velorio || "",
                    tanato: s?.tanato || "",
                    status_raw: typeof raw === "string" ? raw : undefined,
                };
                setOnline(payload);
                setDiag((d) => ({
                    ...d,
                    requestedId,
                    returnedId,
                    statusRaw: payload.status_raw,
                    statusNormalized: payload.status,
                    sourceUsed: "backend",
                }));
            } catch (e: any) {
                if (!cancel) {
                    setOnlineError(e?.message || "Falha ao consultar status.");
                    setDiag((d) => ({
                        ...d,
                        requestedId,
                        sourceUsed: registroLocal ? "local" : "none",
                    }));
                }
            } finally {
                if (!cancel) setLoadingOnline(false);
            }
        }

        run();
        return () => {
            cancel = true;
        };
    }, [open, acaoId, registroLocal]);

    // Dados efetivos usados na UI: prioridade backend válido; senão local
    const efetivo = useMemo(() => {
        if (online) {
            return {
                status: online.status as Fase,
                local_velorio: online.local_velorio,
                tanato: online.tanato,
                fonte: "backend" as const,
                status_raw: online.status_raw,
            };
        }
        if (registroLocal) {
            return {
                status: (registroLocal.status as Fase) ?? ("fase00" as Fase),
                local_velorio: registroLocal.local_velorio,
                tanato: registroLocal.tanato,
                fonte: "local" as const,
                status_raw: undefined as string | undefined,
            };
        }
        return null;
    }, [online, registroLocal]);

    // Regras de skip
    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipTransportando =
        !!efetivo && salasMemorial.includes((efetivo.local_velorio || "").trim());

    // Fases visíveis para cálculo do próximo
    const fasesVisiveis = useMemo<readonly Fase[]>(
        () =>
            (fases as readonly Fase[]).filter((f) => {
                if (efetivo && f === efetivo.status) return true;
                if (skipTransportando && f === "fase07") return false;
                if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
                return true;
            }),
        [skipTransportando, skipConservacao, efetivo]
    );

    // Próxima fase
    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];

        let p = proximaFaseDoRegistro(
            {
                status: (efetivo.status as string) ?? "fase00",
                local_velorio: efetivo.local_velorio,
                tanato: efetivo.tanato,
            },
            visiveis as readonly string[]
        ) as Fase | null;

        if (p) return p;

        // fallback: próxima visível depois da atual
        const idxAtual = fluxoCompleto.indexOf(efetivo.status as Fase);
        if (idxAtual === -1) return null;

        for (let i = idxAtual + 1; i < fluxoCompleto.length; i++) {
            const candidato = fluxoCompleto[i];
            if (visiveis.includes(candidato)) return candidato;
        }
        return null;
    }, [efetivo, fasesVisiveis]);

    // ---- LOG GERAL (para F12): tudo que interessa no mesmo bloco
    useEffect(() => {
        if (!open) return;
        console.groupCollapsed(
            "%c[AcaoModal] Diagnóstico",
            "color:#16a34a;font-weight:bold;"
        );
        console.table({
            requestedId: diag.requestedId ?? String(acaoId ?? ""),
            returnedId: diag.returnedId ?? (online ? online.id : ""),
            fonteUsada: efetivo?.fonte ?? "none",
            status_raw: efetivo?.status_raw ?? "",
            status_normalized: efetivo?.status ?? "",
            skipConservacao,
            skipTransportando,
            prox: prox ?? null,
        });
        console.log("fasesVisiveis:", fasesVisiveis);
        console.log("regLocal:", registroLocal);
        console.log("online payload:", online);
        console.groupEnd();
    }, [open, acaoId, diag, efetivo, fasesVisiveis, prox, registroLocal, online, skipConservacao, skipTransportando]);

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">Registrar uma ação</h2>
                {efetivo && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        id req: {String(acaoId)} | id ret: {online?.id ?? "-"} | fonte: {efetivo.fonte} | raw:{" "}
                        {efetivo.status_raw ?? "?"} | norm: {String(efetivo.status)}
                    </span>
                )}
            </div>

            {/* Status de sincronização / erros visíveis */}
            <div className="mt-2 text-xs text-muted-foreground">
                {loadingOnline && "Sincronizando status com o servidor…"}
                {!loadingOnline && online && !onlineError && "Status sincronizado com o servidor."}
                {!loadingOnline && onlineError && (
                    <span className="text-red-600">
                        {onlineError}
                    </span>
                )}
            </div>

            {!efetivo && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado ou sem dados disponíveis.
                </p>
            )}

            {/* ÚNICO botão: PRÓXIMA etapa calculada a partir do status efetivo */}
            {efetivo && (
                <div className="mt-4">
                    {prox ? (
                        <button
                            type="button"
                            disabled={acaoSubmitting || loadingOnline}
                            onClick={() => registrarAcao(prox)}
                            className={`rounded-md border px-4 py-3 text-sm font-medium ${!acaoSubmitting && !loadingOnline
                                    ? "hover:bg-muted"
                                    : "opacity-50 pointer-events-none"
                                }`}
                            title="Confirmar próxima etapa"
                        >
                            {acaoToStatus(prox)}
                        </button>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            {/* Sem próxima etapa aplicável no momento. */}
                        </span>
                    )}
                </div>
            )}

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
