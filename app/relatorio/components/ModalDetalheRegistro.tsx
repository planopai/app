"use client";
import React, { useEffect, useMemo, useState } from "react";
import { FalecidoItem, LogItem } from "./TiposHistorico";
import { listarLogPorId, obterMateriaisMap, type MateriaisMap } from "./Api";
import LinhaDoTempoLogs from "./LinhaDoTempoLogs";
import ResumoFinal from "./ResumoFinal";
import BotaoExportarPdf from "./BotaoExportarPdf";
import { estaFinalizado, montarResumoFinalDoLog } from "./Normalizadores";

interface Props {
    aberto: boolean;
    registro: FalecidoItem | null;
    onFechar: () => void;
}

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id ?? anyItem?.id ?? "").trim();
}

export default function ModalDetalheRegistro({ aberto, registro, onFechar }: Props) {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(false);

    const [materiaisMap, setMateriaisMap] = useState<MateriaisMap>({});

    useEffect(() => {
        if (!aberto || !registro) return;

        const id = getRegistroId(registro);
        if (!id) {
            setLogs([]);
            return;
        }

        let cancel = false;
        (async () => {
            setLoading(true);
            try {
                const l = await listarLogPorId(id); // ✅ agora usa sepultamento_id OU id
                if (!cancel) setLogs(l);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();

        return () => {
            cancel = true;
        };
    }, [aberto, registro]);

    useEffect(() => {
        if (!aberto) return;
        let cancel = false;
        (async () => {
            const map = await obterMateriaisMap();
            if (!cancel) setMateriaisMap(map || {});
        })();
        return () => {
            cancel = true;
        };
    }, [aberto]);

    const finalizado = useMemo(() => estaFinalizado(logs), [logs]);

    const resumoFinal = useMemo(
        () => (finalizado ? montarResumoFinalDoLog(logs, materiaisMap) : undefined),
        [finalizado, logs, materiaisMap]
    );

    if (!aberto || !registro) return null;

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget) onFechar();
            }}
        >
            <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white/90 p-4 backdrop-blur">
                    <div>
                        <h3 className="text-lg font-semibold leading-tight">{registro.falecido}</h3>
                        <p className="text-xs text-muted-foreground">
                            Histórico completo e relatório final (quando concluído).
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <BotaoExportarPdf
                            desabilitado={loading || logs.length === 0}
                            selecionadoNome={registro.falecido}
                            logVisiveis={logs}
                            resumoFinal={resumoFinal}
                            materiaisMap={materiaisMap}
                        />
                        <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={onFechar}>
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="h-[calc(90vh-56px)] overflow-auto p-4">
                    {loading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                            Carregando histórico…
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                            Nenhum log encontrado para este registro.
                        </div>
                    ) : (
                        <>
                            <LinhaDoTempoLogs logs={logs} materiaisMap={materiaisMap} />
                            <ResumoFinal visivel={!!resumoFinal} resumo={resumoFinal || {}} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
