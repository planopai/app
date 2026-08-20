// CONSERVACAO POR USUARIO FIX V1: IDs 7 (Sandro) e 16 (Joseildo)
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

// ✅ NOVO:
// fases que precisam abrir câmera/foto antes de confirmar a ação
const FASES_COM_FOTO: Fase[] = ["fase06", "fase08"];

function getFotoAcaoTipo(fase: Fase): FotoAcaoTipo | null {
    if (fase === "fase06") return "fim_ornamentacao";
    if (fase === "fase08") return "entrega_corpo";
    return null;
}

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

type MeInfo = {
    id: number;
    usuario: string;
    cargo: string;
    deposito_insumos: string | null;
    pode_conservacao: boolean;
};

async function consultarMe(): Promise<MeInfo> {
    const res = await fetch(`${ENDPOINT}/informativo.php?me=1`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.erro) {
        throw new Error(data?.msg || `Erro ao consultar usuário (${res.status})`);
    }

    const id = Number(data?.id ?? 0) || 0;
    const cargo = String(data?.cargo ?? "").trim().toLowerCase();
    const podeConservacao =
        data?.pode_conservacao === true ||
        data?.pode_conservacao === 1 ||
        data?.pode_conservacao === "1" ||
        ((id === 7 || id === 16) && cargo === "tanatopraxista");

    return {
        id,
        usuario: String(data?.usuario ?? ""),
        cargo,
        deposito_insumos:
            typeof data?.deposito_insumos === "string" && data.deposito_insumos.trim()
                ? data.deposito_insumos.trim()
                : null,
        pode_conservacao: podeConservacao,
    };
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

    // ✅ NOVO:
    // Callback opcional para o page.tsx abrir o modal de foto.
    // Por ser opcional, não quebra o funcionamento atual caso o page.tsx ainda não tenha sido alterado.
    onFotoAcaoRequired,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    registros: Registro[];
    acaoId: Registro["id"] | null | undefined;

    // ✅ vem do page.tsx (mantém offline/telemetria/conferência fase11)
    registrarAcao: (
        acao: string,
        opts?: {
            skipMaterialCheck?: boolean;
            skipConfirm?: boolean;
            extra?: Record<string, any>; // ✅ opcional (pra confirmar conservação no backend)
        }
    ) => Promise<any>;

    // ✅ também vem do page.tsx
    acaoMsg: { text: string; ok: boolean } | null;
    acaoSubmitting: boolean;

    onVeiculoRequired?: (id: string | number | null | undefined, fase: string) => void;

    // ✅ NOVO:
    // usado apenas para fase06 e fase08
    onFotoAcaoRequired?: (
        id: string | number | null | undefined,
        fase: Fase,
        tipo: FotoAcaoTipo
    ) => void;
}) {
    const [frontMsg, setFrontMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const [meId, setMeId] = useState<number>(0);
    const [meCargo, setMeCargo] = useState<string>("");
    const [mePodeConservacao, setMePodeConservacao] = useState(false);
    const [meLoading, setMeLoading] = useState(false);
    const [meError, setMeError] = useState<string | null>(null);

    // carrega cargo ao abrir modal
    useEffect(() => {
        let cancel = false;

        async function run() {
            setMeError(null);
            setMeId(0);
            setMeCargo("");
            setMePodeConservacao(false);
            if (!open) return;

            setMeLoading(true);
            try {
                const me = await consultarMe();
                if (!cancel) {
                    setMeId(me.id);
                    setMeCargo((me.cargo || "").toLowerCase().trim());
                    setMePodeConservacao(!!me.pode_conservacao);
                }
            } catch (e: any) {
                if (!cancel) setMeError(e?.message || "Falha ao consultar permissões.");
            } finally {
                if (!cancel) setMeLoading(false);
            }
        }

        run();
        return () => {
            cancel = true;
        };
    }, [open]);

    useEffect(() => {
        setFrontMsg(null);
    }, [open, acaoId]);

    const registroLocal = useMemo(() => {
        const r = acaoId != null ? registros.find((x) => String(x.id) === String(acaoId)) : undefined;
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
        ornamentacao: string;
        assistencia: string;
        realiza_velorio: string;
        realiza_sepultamento: string;
        tipo_atendimento: "funerario" | "terceiro" | "";
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
                    ornamentacao: s.ornamentacao || "",
                    assistencia: s.assistencia || "",
                    realiza_velorio: s.realiza_velorio || "",
                    realiza_sepultamento: s.realiza_sepultamento || "",
                    tipo_atendimento: s.tipo_atendimento || "",
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
                ornamentacao: online.ornamentacao || registroLocal?.ornamentacao,
                assistencia: online.assistencia || registroLocal?.assistencia,
                realiza_velorio: online.realiza_velorio || (registroLocal as any)?.realiza_velorio || "",
                realiza_sepultamento: online.realiza_sepultamento || (registroLocal as any)?.realiza_sepultamento || "",
                tipo_atendimento: online.tipo_atendimento || (registroLocal as any)?.tipo_atendimento || "",
            };
        }
        if (registroLocal) {
            return {
                status: (registroLocal.status as Fase) ?? ("fase00" as Fase),
                local_velorio: registroLocal.local_velorio,
                tanato: registroLocal.tanato,
                ornamentacao: registroLocal.ornamentacao,
                assistencia: registroLocal.assistencia,
                realiza_velorio: String((registroLocal as any)?.realiza_velorio ?? ""),
                realiza_sepultamento: String((registroLocal as any)?.realiza_sepultamento ?? ""),
                tipo_atendimento: String((registroLocal as any)?.tipo_atendimento ?? ""),
            };
        }
        return null;
    }, [online, registroLocal]);

    const tipoEfetivo = String((efetivo as any)?.tipo_atendimento ?? "")
        .trim()
        .toLowerCase();

    const isTerceiro =
        tipoEfetivo === "terceiro" ||
        (tipoEfetivo !== "funerario" && isTerceiroBySession(acaoId));

    const skipConservacao = !!efetivo && isTanatoNo(efetivo.tanato);
    const skipOrnamentacao = !!efetivo && isNao(efetivo.ornamentacao);
    const skipTransportando = !!efetivo && salasMemorial.includes((efetivo.local_velorio || "").trim());
    const skipMaterialRecolhido = !!efetivo && isNao(efetivo.assistencia);
    const skipVelorio = !!efetivo && isNao((efetivo as any).realiza_velorio);
    const skipSepultamento = !!efetivo && isNao((efetivo as any).realiza_sepultamento);

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
    }, [isTerceiro, efetivo, skipTransportando, skipConservacao, skipOrnamentacao, skipVelorio, skipSepultamento, skipMaterialRecolhido]);

    const prox = useMemo<Fase | null>(() => {
        if (!efetivo) return null;

        const fluxoCompleto = fases as readonly Fase[];
        const visiveis = fasesVisiveis as readonly Fase[];

        const faseFinal = isTerceiro ? ("fase10" as Fase) : (visiveis[visiveis.length - 1] ?? null);
        if (faseFinal && efetivo.status === faseFinal) return null;

        const p = proximaFaseDoRegistro(
            {
                status: (efetivo.status as string) ?? "fase00",
                local_velorio: efetivo.local_velorio,
                tanato: efetivo.tanato,
                ornamentacao: efetivo.ornamentacao,
                assistencia: efetivo.assistencia,
                realiza_velorio: (efetivo as any).realiza_velorio,
                realiza_sepultamento: (efetivo as any).realiza_sepultamento,
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

    const faseFinalEfetiva = isTerceiro ? ("fase10" as Fase) : (fasesVisiveis[fasesVisiveis.length - 1] ?? null);
    const concluido = !!efetivo && !!faseFinalEfetiva && efetivo.status === faseFinalEfetiva;

    function podeConservacao(): boolean {
        return (
            mePodeConservacao &&
            (meId === 7 || meId === 16) &&
            meCargo === "tanatopraxista"
        );
    }

    async function handleClickFase(f: Fase) {
        setFrontMsg(null);

        const habilitar = prox === f && !acaoSubmitting && !loadingOnline && !concluido;
        if (!habilitar) return;

        const requiresVehicle = FASES_COM_VEICULO.includes(f);
        const isConservacao = FASES_CONSERVACAO.includes(f);

        // ✅ REGRA: apenas Tanatopraxista pode fazer conservação (fase03/fase04)
        if (isConservacao) {
            if (meLoading) {
                setFrontMsg({ ok: false, text: "Carregando permissões do usuário… tente novamente." });
                return;
            }
            if (meError) {
                setFrontMsg({ ok: false, text: meError });
                return;
            }
            if (!podeConservacao()) {
                setFrontMsg({ ok: false, text: "Somente Sandro ou Joseildo podem iniciar ou finalizar a conservação." });
                return;
            }

            const ok = window.confirm(`Confirmar "${acaoToStatus(f)}"?`);
            if (!ok) return;

            // chama o pai, sem confirmar de novo
            try {
                await registrarAcao(f, { skipConfirm: true, extra: { confirmar: true } });
            } catch (e: any) {
                setFrontMsg({ ok: false, text: e?.message || "Falha ao registrar ação." });
            }
            return;
        }

        // ✅ NOVO:
        // fase06 = Fim da Ornamentação
        // fase08 = Entrega de Corpo
        // Antes de confirmar a ação, chama o page.tsx para abrir o modal da câmera/foto.
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
            // para fases normais, deixa o pai confirmar e aplicar offline/telemetria/conferência, etc.
            await registrarAcao(f);
        } catch (e: any) {
            setFrontMsg({ ok: false, text: e?.message || "Falha ao registrar ação." });
        }
    }

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            <div className="mt-2 text-xs text-muted-foreground">
                {loadingOnline && "Sincronizando status com o servidor…"}
                {!loadingOnline && online && !onlineError && "Status sincronizado com o servidor."}
                {!loadingOnline && onlineError && (
                    <span className="text-red-600">{onlineError} — exibindo dados locais como fallback.</span>
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

                            const isConservacao = FASES_CONSERVACAO.includes(f);
                            const bloqueadoPorCargo =
                                isConservacao && !meLoading && !meError && meCargo !== "" && !podeConservacao();

                            const disabled = !habilitar || bloqueadoPorCargo;

                            const exigeFoto = FASES_COM_FOTO.includes(f);

                            return (
                                <button
                                    key={f}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handleClickFase(f)}
                                    className={`rounded-md border px-3 py-2 text-sm text-left ${!disabled ? "hover:bg-muted" : "pointer-events-none opacity-50"
                                        }`}
                                    title={
                                        bloqueadoPorCargo
                                            ? "Somente Sandro ou Joseildo"
                                            : habilitar && exigeFoto
                                                ? "Anexar foto para confirmar esta etapa"
                                                : habilitar
                                                    ? "Confirmar próxima etapa"
                                                    : "Aguardando etapas anteriores"
                                    }
                                >
                                    {acaoToStatus(f)}
                                </button>
                            );
                        })}
                    </div>

                    {concluido && <p className="mt-2 text-sm text-muted-foreground">Fluxo concluído para este registro.</p>}
                </>
            )}

            {frontMsg && <TextFeedback kind={frontMsg.ok ? "success" : "error"}>{frontMsg.text}</TextFeedback>}
            {acaoMsg && <TextFeedback kind={acaoMsg.ok ? "success" : "error"}>{acaoMsg.text}</TextFeedback>}
        </Modal>
    );
}