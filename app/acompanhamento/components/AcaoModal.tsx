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

type Fase = (typeof fases)[number];
const FASE_FINAL = "fase11" as Fase;

function isTerceiroBySession(id?: string | number | null | undefined) {
    try {
        if (id == null) return false;
        const raw = sessionStorage.getItem("terceiro_ids");
        if (!raw) return false;
        const arr = JSON.parse(raw) as Array<string | number>;
        return arr.some((v) => String(v) === String(id));
    } catch {
        return false;
    }
}

function isNao(v?: string) {
    const s = (v || "").toString().trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

const FASES_COM_VEICULO: Fase[] = ["fase01", "fase07", "fase09"];
const FASES_CONSERVACAO: Fase[] = ["fase03", "fase04"];

function cargoLogado(): string {
    try {
        return (sessionStorage.getItem("cargo") || "").trim().toLowerCase();
    } catch {
        return "";
    }
}
function isTanatopraxista(): boolean {
    return cargoLogado() === "tanatopraxista";
}

export default function AcaoModal({
    open,
    setOpen,
    registros,
    acaoId,
    registrarAcao,
    acaoMsg,
    acaoSubmitting,
    onVeiculoRequired,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    registros: Registro[];
    acaoId: Registro["id"] | null | undefined;

    // ✅ agora aceita "extra" (ex: {confirmar:true})
    registrarAcao: (acao: string, extra?: Record<string, any>) => Promise<void>;

    acaoMsg: { text: string; ok: boolean } | null;
    acaoSubmitting: boolean;
    onVeiculoRequired?: (id: string | number | null | undefined, fase: string) => void;
}) {
    const [frontMsg, setFrontMsg] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        setFrontMsg(null);
    }, [open, acaoId]);

    const registroLocal = useMemo(() => {
        const r =
            acaoId != null ? registros.find((x) => String(x.id) === String(acaoId)) : undefined;
        if (!r) return undefined;
        const statusFix = (normalizarStatus(r.status) ?? "fase00") as Fase;
        return { ...r, status: statusFix } as Registro & { status: Fase };
    }, [acaoId, registros]);

    const [loadingOnline, setLoadingOnline] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [online, setOnline] = useState<{
        id: string;
        status: Fase;
        local_velorio: string;
        tanato: string;
    } | null>(null);

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

    const efetivo = useMemo(() => {
        if (online) {
            return {
                status: online.status as Fase,
                local_velorio: online.local_velorio,
                tanato: online.tanato,
                assistencia: registroLocal?.assistencia,
            };
        }
        if (registroLocal) {
            return {
                status: (registroLocal.status as Fase) ?? ("fase00" as Fase),
                local_velorio: registroLocal.local_velorio,
                tanato: registroLocal.tanato,
                assistencia: registroLocal.assistencia,
            };
        }
        return null;
    }, [online, registroLocal]);

    const isTerceiro =
        isTerceiroBySession(acaoId) ||
        (registroLocal as any)?.tipo_atendimento === "terceiro" ||
        (typeof registroLocal?.assistencia === "string" &&
            typeof registroLocal?.tanato === "string" &&
            typeof registroLocal?.ornamentacao === "string" &&
            (registroLocal.assistencia || "").toLowerCase() === "não" &&
            (registroLocal.tanato || "").toLowerCase() === "não" &&
            (registroLocal.ornamentacao || "").toLowerCase() === "não");

    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipTransportando =
        !!efetivo && salasMemorial.includes((efetivo.local_velorio || "").trim());
    const skipMaterialRecolhido = !!efetivo && isNao(efetivo.assistencia);

    const fasesVisiveis = useMemo<Fase[]>(() => {
        if (isTerceiro) return ["fase08", "fase09", "fase10"];
        return (fases as readonly Fase[]).filter((f) => {
            if (efetivo && f === efetivo.status) return true;
            if (skipTransportando && f === "fase07") return false;
            if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
            if (skipMaterialRecolhido && f === "fase11") return false;
            return true;
        }) as Fase[];
    }, [isTerceiro, efetivo, skipTransportando, skipConservacao, skipMaterialRecolhido]);

    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];

        const isFinal = isTerceiro ? efetivo.status === "fase10" : efetivo.status === FASE_FINAL;
        if (isFinal) return null;

        let p = proximaFaseDoRegistro(
            {
                status: (efetivo.status as string) ?? "fase00",
                local_velorio: efetivo.local_velorio,
                tanato: efetivo.tanato,
                assistencia: efetivo.assistencia,
            },
            visiveis as readonly string[]
        ) as Fase | null;

        if (p) return p;

        const idxAtual = fluxoCompleto.indexOf(efetivo.status as Fase);
        if (idxAtual === -1) return visiveis[0] ?? null;

        for (let i = idxAtual + 1; i < fluxoCompleto.length; i++) {
            const candidato = fluxoCompleto[i];
            if (visiveis.includes(candidato)) return candidato;
        }
        return null;
    }, [efetivo, fasesVisiveis, isTerceiro]);

    const concluido =
        !!efetivo &&
        (isTerceiro ? efetivo.status === "fase10" : efetivo.status === FASE_FINAL);

    async function handleClickFase(f: Fase) {
        setFrontMsg(null);

        const habilitar = prox === f && !acaoSubmitting && !loadingOnline && !concluido;
        if (!habilitar) return;

        const requiresVehicle = FASES_COM_VEICULO.includes(f);
        const isConservacao = FASES_CONSERVACAO.includes(f);

        // 🔒 regra + confirmação (front) para evitar disparo acidental
        if (isConservacao) {
            if (!isTanatopraxista()) {
                setFrontMsg({
                    ok: false,
                    text: "Este usuário não pode realizar essa ação. Apenas Tanatopraxista.",
                });
                return;
            }

            const ok = window.confirm(`Confirmar "${acaoToStatus(f)}"?`);
            if (!ok) return;
        }

        if (requiresVehicle && onVeiculoRequired) {
            onVeiculoRequired(acaoId ?? null, f);
            return;
        }

        // ✅ aqui está o que faltava: enviar confirmar:true
        await registrarAcao(f, isConservacao ? { confirmar: true } : undefined);
    }

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

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
                                    onClick={() => handleClickFase(f)}
                                    className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar ? "hover:bg-muted" : "pointer-events-none opacity-50"
                                        }`}
                                    title={habilitar ? "Confirmar próxima etapa" : "Aguardando etapas anteriores"}
                                >
                                    {acaoToStatus(f)}
                                </button>
                            );
                        })}
                    </div>

                    {concluido && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            Fluxo concluído para este registro.
                        </p>
                    )}
                </>
            )}

            {frontMsg && (
                <TextFeedback kind={frontMsg.ok ? "success" : "error"}>{frontMsg.text}</TextFeedback>
            )}

            {acaoMsg && (
                <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>
            )}
        </Modal>
    );
}
