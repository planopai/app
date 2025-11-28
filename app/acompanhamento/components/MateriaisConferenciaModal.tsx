"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

export type MatCheckItem = {
    /** chave única (ex: "item:12", "subitem:33" ou o próprio key do MateriaisState) */
    key: string;
    nome: string;
    qtd: number;
};

export default function MateriaisConferenciaModal({
    open,
    onClose,
    onConfirm,
    itens,
    titulo,
    subtitulo,
    confirmLabel,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    itens: MatCheckItem[];
    /** opcional */
    titulo?: string;
    subtitulo?: string;
    confirmLabel?: string;
}) {
    const [okMap, setOkMap] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        const init: Record<string, boolean> = {};
        for (const it of itens) init[it.key] = false;
        setOkMap(init);
        setSubmitting(false);
    }, [open, itens]);

    const total = itens.length;
    const okCount = useMemo(() => itens.filter((it) => okMap[it.key]).length, [itens, okMap]);
    const allOk = total === 0 ? true : okCount === total;

    function setAll(v: boolean) {
        const next: Record<string, boolean> = {};
        for (const it of itens) next[it.key] = v;
        setOkMap(next);
    }

    const resumo = useMemo(() => {
        if (total === 0) return "Nenhum material para conferir.";
        return `Confirmados: ${okCount} / ${total}`;
    }, [okCount, total]);

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Conferência de materiais" maxWidth={680}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold">
                        {titulo || "Conferência de Materiais (Assistência)"}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {subtitulo || "Marque OK em todos os itens e quantidades para liberar a confirmação."}
                    </p>
                </div>

                <button
                    className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                    onClick={onClose}
                    disabled={submitting}
                >
                    Voltar
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <div>{resumo}</div>

                {total > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                            onClick={() => setAll(true)}
                            disabled={submitting}
                        >
                            Marcar todos
                        </button>
                        <button
                            type="button"
                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                            onClick={() => setAll(false)}
                            disabled={submitting}
                        >
                            Desmarcar
                        </button>
                    </div>
                )}
            </div>

            {total === 0 ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Este registro não possui materiais cadastrados para conferência.
                    <div className="mt-1 text-xs text-amber-800">
                        Se isso estiver errado, edite o registro e selecione os materiais em “Assistência (Materiais)”.
                    </div>
                </div>
            ) : (
                <div className="mt-4 rounded-lg border p-3">
                    <div className="mb-2 text-sm font-medium">Itens e quantidades</div>

                    <div className="space-y-2">
                        {itens.map((it) => {
                            const checked = !!okMap[it.key];
                            return (
                                <div
                                    key={it.key}
                                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${checked ? "bg-emerald-50" : "bg-white"
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{it.nome}</div>
                                        <div className="text-xs text-muted-foreground">Qtd: {it.qtd}</div>
                                    </div>

                                    <label className="inline-flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => setOkMap((p) => ({ ...p, [it.key]: e.target.checked }))}
                                            disabled={submitting}
                                        />
                                        OK
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
                <button
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    onClick={onClose}
                    disabled={submitting}
                >
                    Cancelar
                </button>

                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                    disabled={!allOk || submitting}
                    onClick={async () => {
                        if (!allOk || submitting) return;
                        try {
                            setSubmitting(true);
                            await onConfirm();
                        } finally {
                            setSubmitting(false);
                        }
                    }}
                    title={!allOk ? "Confirme todos os itens para liberar" : "Confirmar"}
                    aria-disabled={!allOk || submitting}
                    aria-busy={submitting}
                >
                    {submitting ? "Confirmando…" : confirmLabel || "Confirmar Material Recolhido"}
                </button>
            </div>
        </Modal>
    );
}
