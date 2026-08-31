"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { fases } from "./constants";
import {
    acaoToStatus,
    isTanatoNo,
    proximaFaseDoRegistro,
    normalizarStatus,
    consultarStatusAtual,
    isVelorioMemorial,
} from "./helpers";
import {
    browserSaysOnline,
    getCurrentOfflineSession,
    type OfflineSession,
} from "@/lib/offline/session";
import {
    isOperationalOfflineCommand,
    validateOfflineResponsibility,
} from "@/lib/offline/actions";

type Fase = (typeof fases)[number];
type FotoAcaoTipo = "fim_ornamentacao" | "entrega_corpo";

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
const FASES_COM_FOTO: Fase[] = ["fase06", "fase08"];

function getFotoAcaoTipo(fase: Fase): FotoAcaoTipo | null {
    if (fase === "fase06") return "fim_ornamentacao";
    if (fase === "fase08") return "entrega_corpo";
    return null;
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
    onFotoAcaoRequired,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    registros: Registro[];
    acaoId: Registro["id"] | null | undefined;
    registrarAcao: (
        acao: string,
        opts?: {
            skipMaterialCheck?: boolean;
            skipConfirm?: boolean;
            extra?: Record<string, any>;
        },
    ) => Promise<any>;
    acaoMsg: { text: string; ok: boolean } | null;
    acaoSubmitting: boolean;
    onVeiculoRequired?: (id: string | number | null | undefined, fase: string) => void;
    onFotoAcaoRequired?: (
        id: string | number | null | undefined,
        fase: Fase,
        tipo: FotoAcaoTipo,
    ) => void;
}) {
    const [frontMsg, setFrontMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [me, setMe] = useState<OfflineSession | null>(null);
    const [meLoading, setMeLoading] = useState(false);
    const [meError, setMeError] = useState<string | null>(null);
    const [networkOnline, setNetworkOnline] = useState(true);

    useEffect(() => {
        const update = () => setNetworkOnline(browserSaysOnline());
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    useEffect(() => {
        let cancel = false;

        async function run() {
            setMeError(null);
            if (!open) return;
            setMeLoading(true);
            try {
                const current = await getCurrentOfflineSession({
                    refreshIfOnline: browserSaysOnline(),
                    allowCachedOnNetworkFailure: true,
                });
                if (!cancel) {
                    setMe(current);
                    if (!current) {
                        setMeError("Usuário não está disponível no armazenamento offline. Abra o PAI online antes de sair da empresa.");
                    }
                }
            } catch (e: any) {
                if (!cancel) setMeError(e?.message || "Falha ao identificar o usuário.");
            } finally {
                if (!cancel) setMeLoading(false);
            }
        }

        void run();
        return () => {
            cancel = true;
        };
    }, [open, acaoId, networkOnline]);

    useEffect(() => {
        setFrontMsg(null);
    }, [open, acaoId]);

    const registroLocal = useMemo(() => {
        const r = acaoId != null
            ? registros.find((x) => String(x.id) === String(acaoId))
            : undefined;
        if (!r) return undefined;
        const statusFix = (normalizarStatus(r.status) ?? "fase00") as Fase;
        return { ...r, status: statusFix } as Registro & { status: Fase };
    }, [acaoId, registros]);

    const [loadingOnline, setLoadingOnline] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [online, setOnline] = useState<any>(null);

    useEffect(() => {
        let cancel = false;

        async function run() {
            setOnline(null);
            setOnlineError(null);
            if (!open || !acaoId || !browserSaysOnline()) return;

            setLoadingOnline(true);
            try {
                const s: any = await consultarStatusAtual(acaoId);
                if (cancel) return;
                setOnline({
                    ...s,
                    id: String(s.id ?? acaoId),
                    status: (normalizarStatus(s.status) ?? "fase00") as Fase,
                });
            } catch (e: any) {
                if (!cancel) setOnlineError(e?.message || "Falha ao consultar status.");
            } finally {
                if (!cancel) setLoadingOnline(false);
            }
        }

        void run();
        return () => {
            cancel = true;
        };
    }, [open, acaoId, networkOnline]);

    const efetivo = useMemo(() => {
        if (online) {
            return {
                ...registroLocal,
                ...online,
                status: online.status as Fase,
                local_velorio: online.local_velorio || registroLocal?.local_velorio || "",
                sala_velorio: online.sala_velorio || registroLocal?.sala_velorio || "",
                tanato: online.tanato || registroLocal?.tanato || "",
                ornamentacao: online.ornamentacao || registroLocal?.ornamentacao || "",
                assistencia: online.assistencia || registroLocal?.assistencia || "",
                realiza_velorio: online.realiza_velorio || registroLocal?.realiza_velorio || "",
                realiza_sepultamento: online.realiza_sepultamento || registroLocal?.realiza_sepultamento || "",
                tipo_atendimento: online.tipo_atendimento || registroLocal?.tipo_atendimento || "",
                responsavel_velorio_id: online.responsavel_velorio_id ?? registroLocal?.responsavel_velorio_id,
                responsavel_velorio_nome: online.responsavel_velorio_nome ?? registroLocal?.responsavel_velorio_nome,
                responsavel_sepultamento_id:
                    online.responsavel_sepultamento_id ?? registroLocal?.responsavel_sepultamento_id,
                responsavel_sepultamento_nome:
                    online.responsavel_sepultamento_nome ?? registroLocal?.responsavel_sepultamento_nome,
            } as Registro & { status: Fase };
        }
        return registroLocal ?? null;
    }, [online, registroLocal]);

    const tipoEfetivo = String((efetivo as any)?.tipo_atendimento ?? "").trim().toLowerCase();
    const isTerceiro =
        tipoEfetivo === "terceiro" ||
        (tipoEfetivo !== "funerario" && isTerceiroBySession(acaoId));

    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipOrnamentacao = !!efetivo && isNao(efetivo.ornamentacao);
    const skipTransportando = !!efetivo && isVelorioMemorial(efetivo);
    const skipMaterialRecolhido = !!efetivo && isNao(efetivo.assistencia);
    const skipVelorio = !!efetivo && isNao(efetivo.realiza_velorio);
    const skipSepultamento = !!efetivo && isNao(efetivo.realiza_sepultamento);

    const fasesVisiveis = useMemo<Fase[]>(() => {
        if (isTerceiro) return ["fase08", "fase09", "fase10"];
        return (fases as readonly Fase[]).filter((f) => {
            if (efetivo && f === efetivo.status) return true;
            if (skipTransportando && f === "fase07") return false;
            if (skipConservacao && (f === "fase03" || f === "fase04")) return false;
            if (skipOrnamentacao && (f === "fase05" || f === "fase06")) return false;
            if (skipVelorio && (f === "fase07" || f === "fase08")) return false;
            if (skipSepultamento && (f === "fase09" || f === "fase10")) return false;
            if (skipMaterialRecolhido && f === "fase11") return false;
            return true;
        }) as Fase[];
    }, [
        isTerceiro,
        efetivo,
        skipTransportando,
        skipConservacao,
        skipOrnamentacao,
        skipVelorio,
        skipSepultamento,
        skipMaterialRecolhido,
    ]);

    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];
        const faseFinal = isTerceiro ? ("fase10" as Fase) : (visiveis[visiveis.length - 1] ?? null);
        if (faseFinal && efetivo.status === faseFinal) return null;

        const p = proximaFaseDoRegistro(
            {
                status: efetivo.status ?? "fase00",
                local_velorio: efetivo.local_velorio,
                sala_velorio: efetivo.sala_velorio,
                tanato: efetivo.tanato,
                ornamentacao: efetivo.ornamentacao,
                assistencia: efetivo.assistencia,
                realiza_velorio: efetivo.realiza_velorio,
                realiza_sepultamento: efetivo.realiza_sepultamento,
            },
            visiveis as readonly string[],
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

    const faseFinalEfetiva = isTerceiro
        ? ("fase10" as Fase)
        : (fasesVisiveis[fasesVisiveis.length - 1] ?? null);
    const concluido = !!efetivo && !!faseFinalEfetiva && efetivo.status === faseFinalEfetiva;

    function podeConservacao(): boolean {
        return !!me?.podeConservacao && (me.userId === "7" || me.userId === "16") && me.cargo === "tanatopraxista";
    }

    function offlineBlockReason(f: Fase): string | null {
        if (networkOnline) return null;
        if (!me) return "Usuário offline não identificado.";
        if (!efetivo) return "Atendimento indisponível no cache local.";

        if (f === "fase07") return "Transportando Óbito P/Velório precisa ser iniciado com internet para registrar o responsável.";
        if (f === "fase09") return "Transportando P/ Sepultamento precisa ser iniciado com internet para registrar o responsável.";
        if (f === "fase12") return "Corpo Pronto exige internet por envolver baixa de estoque.";
        if (f === "fase06") return "Fim da Ornamentação permanece online nesta versão.";

        if (isOperationalOfflineCommand(f)) {
            const validation = validateOfflineResponsibility(efetivo, f, me);
            return validation.ok ? null : validation.message;
        }

        return "Esta etapa exige conexão com a internet nesta versão offline.";
    }

    async function handleClickFase(f: Fase) {
        setFrontMsg(null);

        const habilitar = prox === f && !acaoSubmitting && !loadingOnline && !concluido;
        if (!habilitar) return;

        const blockReason = offlineBlockReason(f);
        if (blockReason) {
            setFrontMsg({ ok: false, text: blockReason });
            return;
        }

        const requiresVehicle = FASES_COM_VEICULO.includes(f);
        const isConservacao = FASES_CONSERVACAO.includes(f);

        if (isConservacao) {
            if (meLoading) {
                setFrontMsg({ ok: false, text: "Carregando permissões do usuário. Tente novamente." });
                return;
            }
            if (meError) {
                setFrontMsg({ ok: false, text: meError });
                return;
            }
            if (!podeConservacao()) {
                setFrontMsg({ ok: false, text: "Somente os tanatopraxistas autorizados podem iniciar ou finalizar a conservação." });
                return;
            }

            const ok = window.confirm(`Confirmar "${acaoToStatus(f)}"?`);
            if (!ok) return;
            await registrarAcao(f, { skipConfirm: true, extra: { confirmar: true } });
            return;
        }

        const fotoTipo = FASES_COM_FOTO.includes(f) ? getFotoAcaoTipo(f) : null;
        if (fotoTipo && onFotoAcaoRequired) {
            onFotoAcaoRequired(acaoId ?? null, f, fotoTipo);
            return;
        }

        if (requiresVehicle && onVeiculoRequired) {
            onVeiculoRequired(acaoId ?? null, f);
            return;
        }

        try {
            await registrarAcao(f);
        } catch (e: any) {
            setFrontMsg({ ok: false, text: e?.message || "Falha ao registrar ação." });
        }
    }

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            <div className="mt-2 text-xs text-muted-foreground">
                {!networkOnline && (
                    <span className="font-semibold text-amber-700">
                        Modo offline. Somente as etapas operacionais autorizadas ficam disponíveis.
                    </span>
                )}
                {networkOnline && loadingOnline && "Sincronizando status com o servidor..."}
                {networkOnline && !loadingOnline && online && !onlineError && "Status sincronizado com o servidor."}
                {networkOnline && !loadingOnline && onlineError && (
                    <span className="text-red-600">{onlineError}. Exibindo dados locais como fallback.</span>
                )}
            </div>

            {efetivo && !networkOnline && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div>Usuário: <b>{me?.userName || "não identificado"}</b></div>
                    {efetivo.responsavel_velorio_nome && (
                        <div>Responsável pelo velório: <b>{efetivo.responsavel_velorio_nome}</b></div>
                    )}
                    {efetivo.responsavel_sepultamento_nome && (
                        <div>Responsável pelo sepultamento: <b>{efetivo.responsavel_sepultamento_nome}</b></div>
                    )}
                </div>
            )}

            {!efetivo && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado. Selecione um registro para continuar.
                </p>
            )}

            {efetivo && fasesVisiveis.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fasesVisiveis.map((f) => {
                        const habilitar = prox === f && !acaoSubmitting && !loadingOnline && !concluido;
                        const isConservacao = FASES_CONSERVACAO.includes(f);
                        const bloqueadoPorCargo = isConservacao && !meLoading && !!me && !podeConservacao();
                        const reason = habilitar ? offlineBlockReason(f) : null;
                        const disabled = !habilitar || bloqueadoPorCargo || !!reason;
                        const exigeFoto = FASES_COM_FOTO.includes(f);

                        return (
                            <button
                                key={f}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleClickFase(f)}
                                className={`rounded-md border px-3 py-2 text-left text-sm ${!disabled ? "hover:bg-muted" : "opacity-50"}`}
                                title={
                                    reason ||
                                    (bloqueadoPorCargo
                                        ? "Usuário sem permissão para conservação"
                                        : habilitar && exigeFoto
                                            ? "Anexar foto para confirmar esta etapa"
                                            : habilitar
                                                ? "Confirmar próxima etapa"
                                                : "Aguardando etapas anteriores")
                                }
                            >
                                {acaoToStatus(f)}
                            </button>
                        );
                    })}
                </div>
            )}

            {concluido && (
                <p className="mt-2 text-sm text-muted-foreground">Fluxo concluído para este registro.</p>
            )}

            {meError && !networkOnline && (
                <TextFeedback kind="error">{meError}</TextFeedback>
            )}
            {frontMsg && <TextFeedback kind={frontMsg.ok ? "success" : "error"}>{frontMsg.text}</TextFeedback>}
            {acaoMsg && <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>}
        </Modal>
    );
}
