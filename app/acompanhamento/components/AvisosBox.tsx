"use client";
import React from "react";
import { Aviso } from "./types";
import TextFeedback from "./TextFeedback";
import EditableText from "./EditableText";

export default function AvisosBox({
    avisos,
    avisoMsg,
    setAvisoMsg,
    enviarAviso,
    editarAviso,
    excluirAviso,
    finalizarAviso,
    avisoInputRef,
}: {
    avisos: Aviso[];
    avisoMsg: { text: string; ok: boolean } | null;
    setAvisoMsg: (m: { text: string; ok: boolean } | null) => void;
    enviarAviso: () => Promise<void>;
    editarAviso: (id: number | string, mensagem: string) => Promise<void>;
    excluirAviso: (id: number | string) => Promise<void>;
    finalizarAviso: (id: number | string) => Promise<void>;
    avisoInputRef: React.RefObject<HTMLInputElement | null>; // <- anulável
}) {
    return (
        <section className="mt-8 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">Avisos do Plantão</h2>
            <div className="mt-3 flex gap-2">
                <input
                    ref={avisoInputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    maxLength={255}
                    placeholder="Digite um aviso..."
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") enviarAviso();
                    }}
                />
            </div>
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                    onClick={enviarAviso}
                >
                    Enviar
                </button>
                {avisoMsg && (
                    <TextFeedback kind={avisoMsg.ok ? "success" : "error"}>
                        {avisoMsg.text}
                    </TextFeedback>
                )}
            </div>

            <ul className="mt-4 space-y-2">
                {avisos
                    .filter((a) => a.finalizado !== 1)
                    .map((a) => (
                        <li
                            key={String(a.id)}
                            className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                        >
                            <span className="rounded bg-muted px-2 py-0.5 text-xs">{a.usuario}</span>
                            <EditableText
                                text={a.mensagem}
                                onSave={(t) => editarAviso(a.id, t)}
                                className="min-w-[220px] flex-1"
                            />
                            <span className="text-xs opacity-70">
                                {new Date(a.criado_em).toLocaleString()}
                            </span>
                            <div className="ml-auto flex gap-2">
                                <button
                                    className="rounded-md border px-2 py-1 text-xs"
                                    onClick={() => excluirAviso(a.id)}
                                >
                                    Excluir
                                </button>
                                <button
                                    className="rounded-md border px-2 py-1 text-xs"
                                    onClick={() => finalizarAviso(a.id)}
                                >
                                    Finalizar
                                </button>
                            </div>
                        </li>
                    ))}
            </ul>
        </section>
    );
}
