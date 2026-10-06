"use client";

import React from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { situacaoTermo } from "./termos";

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
                            className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10 border-[#E3E8F0] dark:border-white/[0.12]"
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

            <div className="my-4 h-px bg-[#E3E8F0] dark:bg-white/15" />

            {/* AÇÕES DE ASSINATURA */}
            <div className="grid gap-2">
                <button
                    className="w-full rounded-md border border-transparent px-3 py-2 text-sm text-left text-white bg-[#313C55] hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "recebimento");
                        }
                    }}
                >
                    Termo de Recebimento de Material
                </button>

                {situacaoTermo(registro, "recebimento").assinado && (
                    <p className="w-full rounded-md bg-[#EEF5D6] px-3 py-2 text-sm font-bold text-[#313C55] text-center">
                        ✓ Termo de recebimento assinado — toque no termo para ver ou baixar
                    </p>
                )}

                <button
                    className="w-full rounded-md border border-transparent px-3 py-2 text-sm text-left text-white bg-[#313C55] hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "requisicao");
                        }
                    }}
                >
                    Termo de Requisição de Veículo
                </button>

                {situacaoTermo(registro, "requisicao").assinado && (
                    <p className="w-full rounded-md bg-[#EEF5D6] px-3 py-2 text-sm font-bold text-[#313C55] text-center">
                        ✓ Termo de requisição assinado — toque no termo para ver ou baixar
                    </p>
                )}
            </div>
        </Modal>
    );
}
