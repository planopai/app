"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";

export type MatCheckItem = {
    key: string; // usado internamente (não exibimos)
    nome: string;
    qtd: number;
};

type PerItemState = {
    ok: boolean;
    naoConforme: boolean;
};

export type MateriaisConferenciaResult = {
    itens: Array<{
        key: string;
        nome: string;
        qtd: number;
        ok: boolean;
        naoConforme: boolean;
    }>;
    observacao: string;
};

type Props = {
    open: boolean;
    itens: MatCheckItem[];
    onClose: () => void;
    onConfirm: (result?: MateriaisConferenciaResult) => void | Promise<void>;
};

export default function MateriaisConferenciaModal({ open, itens, onClose, onConfirm }: Props) {
    const [states, setStates] = useState<Record<string, PerItemState>>({});
    const [observacao, setObservacao] = useState("");
    const [erro, setErro] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const obsRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!open) return;

        const initial: Record<string, PerItemState> = {};
        for (const it of itens || []) initial[String(it.key)] = { ok: false, naoConforme: false };

        setStates(initial);
        setObservacao("");
        setErro(null);
        setSubmitting(false);
    }, [open, itens]);

    const totals = useMemo(() => {
        const keys = (itens || []).map((i) => String(i.key));
        let ok = 0;
        let nc = 0;
        for (const k of keys) {
            const st = states[k];
            if (!st) continue;
            if (st.ok) ok++;
            if (st.naoConforme) nc++;
        }
        return { total: keys.length, ok, nc };
    }, [itens, states]);

    const allResolved = useMemo(() => {
        if (!itens || itens.length === 0) return false;
        return itens.every((it) => {
            const st = states[String(it.key)];
            return !!st && (st.ok || st.naoConforme);
        });
    }, [itens, states]);

    const anyNaoConforme = useMemo(() => {
        if (!itens || itens.length === 0) return false;
        return itens.some((it) => states[String(it.key)]?.naoConforme);
    }, [itens, states]);

    const toggleOk = (key: string) => {
        setErro(null);
        setStates((prev) => {
            const cur = prev[key] ?? { ok: false, naoConforme: false };
            const nextOk = !cur.ok;
            return { ...prev, [key]: { ok: nextOk, naoConforme: nextOk ? false : cur.naoConforme } };
        });
    };

    const toggleNaoConforme = (key: string) => {
        setErro(null);
        setStates((prev) => {
            const cur = prev[key] ?? { ok: false, naoConforme: false };
            const nextNc = !cur.naoConforme;
            return { ...prev, [key]: { ok: nextNc ? false : cur.ok, naoConforme: nextNc } };
        });

        setTimeout(() => obsRef.current?.focus(), 50);
    };

    const handleConfirm = async () => {
        if (submitting) return;
        setErro(null);

        if (!itens || itens.length === 0) {
            setErro("Não há itens para conferir.");
            return;
        }
        if (!allResolved) {
            setErro("Marque OK ou Não Conforme para todos os itens.");
            return;
        }

        const result: MateriaisConferenciaResult = {
            itens: (itens || []).map((it) => {
                const k = String(it.key);
                const st = states[k] ?? { ok: false, naoConforme: false };
                return { key: k, nome: it.nome, qtd: Number(it.qtd ?? 0), ok: !!st.ok, naoConforme: !!st.naoConforme };
            }),
            observacao: observacao.trim(),
        };

        try {
            setSubmitting(true);
            await onConfirm(result);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Conferência de Materiais" maxWidth={680}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Conferência de Materiais</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Para confirmar <span className="font-medium">Material Recolhido</span>, marque{" "}
                        <span className="font-medium">OK</span> ou <span className="font-medium">Não Conforme</span> em cada item.
                    </p>
                </div>

                <div className="shrink-0 text-right">
                    <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">
                        {totals.ok}/{totals.total} OK
                    </div>
                    {totals.nc > 0 && (
                        <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 border border-amber-200 whitespace-nowrap">
                            {totals.nc} Não Conforme
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border">
                {(!itens || itens.length === 0) && (
                    <div className="p-4 text-sm text-muted-foreground">Nenhum material selecionado para conferência.</div>
                )}

                {(itens || []).map((it) => {
                    const k = String(it.key);
                    const st = states[k] ?? { ok: false, naoConforme: false };

                    const pill = st.ok ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            OK
                        </span>
                    ) : st.naoConforme ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Não Conforme
                        </span>
                    ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Pendente
                        </span>
                    );

                    return (
                        <div key={k} className="border-b p-3 last:border-b-0">
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-base font-semibold leading-snug whitespace-normal break-words">
                                            {it.nome}
                                        </div>
                                        {pill}
                                    </div>

                                    <div className="mt-0.5 text-sm text-muted-foreground">
                                        Qtd: <span className="font-medium text-foreground">{Number(it.qtd ?? 0)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                                    <button
                                        type="button"
                                        onClick={() => toggleOk(k)}
                                        className={[
                                            "rounded-md border px-3 py-2 text-sm font-medium transition",
                                            st.ok ? "bg-emerald-600 text-white border-emerald-700" : "hover:bg-muted",
                                        ].join(" ")}
                                        aria-pressed={st.ok}
                                    >
                                        OK
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => toggleNaoConforme(k)}
                                        className={[
                                            "rounded-md border px-3 py-2 text-sm font-medium transition",
                                            st.naoConforme ? "bg-amber-500 text-white border-amber-600" : "hover:bg-muted",
                                        ].join(" ")}
                                        aria-pressed={st.naoConforme}
                                    >
                                        Não Conforme
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 rounded-lg border p-3">
                <label className="block text-sm font-medium" htmlFor="mat-conf-obs">
                    Observação{" "}
                    {anyNaoConforme ? <span className="text-xs text-muted-foreground">(há itens não conformes)</span> : null}
                </label>

                <textarea
                    id="mat-conf-obs"
                    ref={obsRef}
                    className="mt-2 w-full min-h-[92px] resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Descreva observações gerais (ex.: item faltando, quantidade divergente, avaria...)"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    maxLength={700}
                />

                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span className={erro ? "text-destructive" : ""}>{erro ? erro : " "}</span>
                    <span>{observacao.trim().length}/700</span>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
                <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    onClick={onClose}
                    disabled={submitting}
                >
                    Cancelar
                </button>

                <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    onClick={handleConfirm}
                    disabled={!allResolved || submitting}
                    aria-busy={submitting}
                    title={!allResolved ? "Marque OK ou Não Conforme para todos os itens" : "Confirmar conferência"}
                >
                    {submitting ? "Salvando..." : "Confirmar"}
                </button>
            </div>
        </Modal>
    );
}
