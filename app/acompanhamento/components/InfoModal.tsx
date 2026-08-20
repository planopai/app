"use client";

import React from "react";
import Modal from "./Modal";
import type { Registro } from "./types";

export default function InfoModal({
    open,
    setOpen,
    infoIdx,
    abrirWizard,
    abrirAssinatura,
    registro,
    // ✅ novo: títulos dinâmicos do wizard (de acordo com tipo: funerario/terceiro)
    wizardStepTitles,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    infoIdx: number | null;

    abrirWizard: (tipo: "novo" | "editar", idx?: number | null, grupoStep?: number | null) => void;

    abrirAssinatura: (idx: number, tipo: "recebimento" | "requisicao") => void;

    registro?: Registro | null;

    // ✅ IMPORTANTE: vem do AcompanhamentoPage (wizardStepTitlesForTipo)
    wizardStepTitles: Array<string | null>;
}) {
    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Info" maxWidth={410}>
            <h2 className="text-xl font-semibold">Informações do Registro</h2>

            {/* Atalhos de edição por grupo (dinâmico por tipo) */}
            <div className="mt-4 grid gap-2">
                {(wizardStepTitles || []).map((t, i) => {
                    if (!t) return null;
                    return (
                        <button
                            key={`${t}-${i}`}
                            className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
                            onClick={() => {
                                setOpen(false);
                                if (infoIdx != null) abrirWizard("editar", infoIdx, i);
                            }}
                        >
                            {t}
                        </button>
                    );
                })}
            </div>

            <div className="my-4 h-px bg-slate-200" />

            {/* AÇÕES DE ASSINATURA */}
            <div className="grid gap-2">
                <button
                    className="w-full rounded-md border border-transparent px-3 py-2 text-sm text-left text-white bg-[#059de0] hover:bg-[#059de0]/90"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "recebimento");
                        }
                    }}
                >
                    Termo de Recebimento de Material
                </button>

                {registro?.assinatura_recebimento_url && (
                    <a
                        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm text-white text-center"
                        href={registro.assinatura_recebimento_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Baixar Termo (assinatura de recebimento)
                    </a>
                )}

                <button
                    className="w-full rounded-md border border-transparent px-3 py-2 text-sm text-left text-white bg-[#059de0] hover:bg-[#059de0]/90"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "requisicao");
                        }
                    }}
                >
                    Termo de Requisição de Veículo
                </button>

                {registro?.assinatura_requisicao_url && (
                    <a
                        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm text-white text-center"
                        href={registro.assinatura_requisicao_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Baixar Termo (assinatura de requisição)
                    </a>
                )}
            </div>
        </Modal>
    );
}