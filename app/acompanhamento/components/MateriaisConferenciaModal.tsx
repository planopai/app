"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";

export type MatCheckItem = {
    key: string;
    nome: string;
    qtd: number;
};

type ConfirmPayload = {
    naoConforme: boolean;
    observacao: string;
};

type Props = {
    open: boolean;
    itens: MatCheckItem[];
    onClose: () => void;

    /**
     * Mantive compatível com o que você já usa no page.tsx.
     * Ele pode ser chamado sem parâmetro (como hoje), ou com o payload.
     */
    onConfirm: (payload?: ConfirmPayload) => void | Promise<void>;
};

export default function MateriaisConferenciaModal({ open, itens, onClose, onConfirm }: Props) {
    const [naoConforme, setNaoConforme] = useState(false);
    const [observacao, setObservacao] = useState("");
    const [erro, setErro] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const obsRef = useRef<HTMLTextAreaElement>(null);

    const totalItens = useMemo(() => {
        return (itens || []).reduce((acc, it) => acc + (Number(it?.qtd ?? 0) > 0 ? 1 : 0), 0);
    }, [itens]);

    useEffect(() => {
        if (!open) return;
        setNaoConforme(false);
        setObservacao("");
        setErro(null);
        setSubmitting(false);
    }, [open]);

    useEffect(() => {
        if (open && naoConforme) {
            // pequeno delay pra garantir render do textarea
            setTimeout(() => obsRef.current?.focus(), 50);
        }
    }, [open, naoConforme]);

    const handleConfirm = async () => {
        if (submitting) return;

        setErro(null);

        if (naoConforme) {
            const obs = observacao.trim();
            if (!obs) {
                setErro("Informe uma observação para a opção “Não Conforme”.");
                obsRef.current?.focus();
                return;
            }
        }

        try {
            setSubmitting(true);
            await onConfirm({
                naoConforme,
                observacao: observacao.trim(),
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Conferência de Materiais" maxWidth={560}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Conferência de Materiais</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Confirme os materiais antes de marcar <span className="font-medium">Material Recolhido</span>.
                    </p>
                </div>

                <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">
                    {totalItens} item(ns)
                </div>
            </div>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border">
                {(!itens || itens.length === 0) && (
                    <div className="p-4 text-sm text-muted-foreground">Nenhum material selecionado para conferência.</div>
                )}

                {(itens || []).map((it) => (
                    <div key={it.key} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{it.nome}</div>
                            <div className="text-xs text-muted-foreground">Chave: {it.key}</div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Qtd</span>
                            <span className="inline-flex min-w-[44px] justify-center rounded-md border bg-background px-2 py-1 text-sm">
                                {Number(it.qtd ?? 0)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Não Conforme + Observação */}
            <div className="mt-4 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">Status da conferência</div>
                        <div className="text-xs text-muted-foreground">
                            Se houver divergência, marque <span className="font-medium">Não Conforme</span> e descreva o motivo.
                        </div>
                    </div>

                    <button
                        type="button"
                        className={[
                            "shrink-0 rounded-md border px-3 py-2 text-sm transition",
                            naoConforme ? "bg-destructive text-destructive-foreground border-destructive/40" : "hover:bg-muted",
                        ].join(" ")}
                        onClick={() => {
                            setErro(null);
                            setNaoConforme((v) => !v);
                        }}
                        aria-pressed={naoConforme}
                    >
                        Não Conforme
                    </button>
                </div>

                {naoConforme && (
                    <div className="mt-3">
                        <label className="block text-sm font-medium" htmlFor="mat-check-obs">
                            Observação
                        </label>
                        <textarea
                            id="mat-check-obs"
                            ref={obsRef}
                            className="mt-2 w-full min-h-[88px] resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Descreva o motivo da não conformidade (ex.: item faltando, quantidade divergente, avaria...)"
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            maxLength={600}
                        />
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{erro ? <span className="text-destructive">{erro}</span> : " "}</span>
                            <span>{observacao.trim().length}/600</span>
                        </div>
                    </div>
                )}

                {!naoConforme && erro && (
                    <div className="mt-2 text-xs text-destructive">{erro}</div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-end gap-2">
                <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    onClick={onClose}
                    disabled={submitting}
                >
                    Cancelar
                </button>

                <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    onClick={handleConfirm}
                    disabled={submitting}
                >
                    {submitting ? "Salvando..." : "OK"}
                </button>
            </div>
        </Modal>
    );
}
