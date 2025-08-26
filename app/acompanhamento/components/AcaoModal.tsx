"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import { Registro } from "./types";
import { API, fases } from "./constants";
import { acaoToStatus } from "./helpers";
import { jsonWith401 } from "./helpers";

type Fase = (typeof fases)[number];

type ProximaAcaoDTO = {
    atual: Fase | null;        // "fase08"
    proxima: Fase | null;      // "fase09" ou null (fluxo concluído)
    fasesVisiveis: Fase[];     // normalmente todas as fases, ou já com “skips”
    msg?: string;
};

function uuid() {
    return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export default function AcaoModal({
    open,
    setOpen,
    registros,
    acaoId,
    acaoMsg,
    acaoSubmitting,          // mantém compat, mas o modal controla envio
    onAfterAction,           // opcional: para a página recarregar a tabela imediatamente
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    registros: Registro[];
    acaoId: Registro["id"] | null | undefined;
    acaoMsg?: { text: string; ok: boolean } | null;
    acaoSubmitting?: boolean;
    onAfterAction?: () => void;
}) {
    const [data, setData] = useState<ProximaAcaoDTO | null>(null);
    const [loading, setLoading] = useState(false);
    const [localMsg, setLocalMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [posting, setPosting] = useState(false);

    const registroAtual = useMemo(
        () => (acaoId != null ? registros.find((x) => x.id === acaoId) : undefined),
        [acaoId, registros]
    );

    async function refetch() {
        if (!acaoId) return;
        setLoading(true);
        try {
            const r = await jsonWith401(`${API}/registros/${acaoId}/proxima-acao`);
            setData({
                atual: (r?.atual ?? null) as Fase | null,
                proxima: (r?.proxima ?? null) as Fase | null,
                fasesVisiveis: ((r?.fasesVisiveis ?? fases) as Fase[]),
                msg: r?.msg,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!open || !acaoId) {
            setData(null);
            return;
        }
        void refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, acaoId]);

    async function onClickFase(f: Fase) {
        if (!acaoId || posting) return;
        const ok = window.confirm("Deseja confirmar essa ação?");
        if (!ok) return;

        setPosting(true);
        setLocalMsg(null);
        try {
            await jsonWith401(`${API}/registros/${acaoId}/acao`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fase: f, idempotencyKey: uuid() }),
            });
            await refetch();
            setLocalMsg({ text: "Ação registrada.", ok: true });
            onAfterAction?.();                // avisa a página para recarregar a tabela
        } catch (e: any) {
            try { await refetch(); } catch { }
            setLocalMsg({ text: e?.message || "Falha ao registrar ação.", ok: false });
        } finally {
            setPosting(false);
        }
    }

    const fasesVisiveis = data?.fasesVisiveis ?? [];
    const proxima = data?.proxima ?? null;

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Registrar ação">
            <h2 className="text-xl font-semibold">Registrar uma ação</h2>

            {!registroAtual && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum registro selecionado. Selecione um registro para continuar.
                </p>
            )}

            {registroAtual && (
                <>
                    {loading && (
                        <p className="mt-4 text-sm text-muted-foreground">Carregando próximas etapas…</p>
                    )}

                    {!loading && fasesVisiveis.length === 0 && (
                        <p className="mt-4 text-sm text-muted-foreground">
                            Nenhuma etapa disponível para este registro com as condições atuais.
                        </p>
                    )}

                    {!loading && fasesVisiveis.length > 0 && (
                        <>
                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {fasesVisiveis.map((f) => {
                                    const habilitar = proxima === f && !posting;
                                    return (
                                        <button
                                            key={f}
                                            type="button"
                                            disabled={!habilitar}
                                            onClick={() => onClickFase(f)}
                                            className={`rounded-md border px-3 py-2 text-sm text-left ${habilitar ? "hover:bg-muted" : "pointer-events-none opacity-50"
                                                }`}
                                            title={habilitar ? "Confirmar próxima etapa" : "Aguardando etapas anteriores"}
                                        >
                                            {acaoToStatus(f)}
                                        </button>
                                    );
                                })}
                            </div>

                            {proxima === null && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Fluxo concluído para este registro.
                                </p>
                            )}

                            {!!data?.msg && (
                                <p className="mt-2 text-xs text-muted-foreground">{data.msg}</p>
                            )}
                        </>
                    )}
                </>
            )}

            {(acaoMsg || localMsg) && (
                <TextFeedback kind={(acaoMsg ?? localMsg)!.ok ? "success" : "error"}>
                    {(acaoMsg ?? localMsg)!.text}
                </TextFeedback>
            )}
        </Modal>
    );
}
