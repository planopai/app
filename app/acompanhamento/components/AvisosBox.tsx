"use client";

import React, { useMemo, useState } from "react";
import type { Aviso, Registro } from "./types";
import TextFeedback from "./TextFeedback";

const TAG_SERVICO = "[Serviço]";
const TAG_GERAL = "[Geral]";

function parseAvisoMensagem(raw: any): { tag: "Serviço" | "Geral"; text: string } {
    const s = String(raw ?? "").trim();

    if (s.startsWith(TAG_SERVICO)) {
        return { tag: "Serviço", text: s.slice(TAG_SERVICO.length).trim() };
    }
    if (s.startsWith(TAG_GERAL)) {
        return { tag: "Geral", text: s.slice(TAG_GERAL.length).trim() };
    }

    // fallback (caso exista aviso antigo sem tag)
    return { tag: "Geral", text: s };
}

function TagChip({ kind }: { kind: "Serviço" | "Geral" }) {
    // ✅ MODIFICADO: Geral = vermelho | Serviço = amarelo
    const cls =
        kind === "Serviço"
            ? "bg-yellow-100 text-yellow-900 border-yellow-200"
            : "bg-red-100 text-red-800 border-red-200";

    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] ${cls}`}>
            {kind}
        </span>
    );
}

function Modal({
    open,
    title,
    subtitle,
    children,
    onClose,
    disableClose,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onClose: () => void;
    disableClose?: boolean;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={disableClose ? undefined : onClose}
                aria-hidden
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border bg-background shadow-2xl overflow-hidden">
                <div className="border-b px-4 py-3 sm:px-5 sm:py-4 bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-semibold leading-tight break-words [overflow-wrap:anywhere]">
                                {title}
                            </h3>
                            {subtitle ? (
                                <p className="mt-1 text-[14px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                                    {subtitle}
                                </p>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            className="shrink-0 rounded-full border px-3 py-1.5 text-[14px] hover:bg-muted disabled:opacity-60"
                            onClick={onClose}
                            disabled={!!disableClose}
                            aria-label="Fechar"
                            title="Fechar"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
            </div>
        </div>
    );
}

export default function AvisosBox({
    avisos,
    registros,
    onAddObservacao,

    avisoMsg,
    setAvisoMsg,
    enviarAviso,
    editarAviso,
    excluirAviso,
    avisoInputRef,
}: {
    avisos: Aviso[];
    registros: Registro[];
    onAddObservacao: (registroId: string) => void;

    avisoMsg: { text: string; ok: boolean } | null;
    setAvisoMsg: (m: { text: string; ok: boolean } | null) => void;

    enviarAviso: () => Promise<void>;
    editarAviso: (id: number | string, mensagem: string) => Promise<void>;
    excluirAviso: (id: number | string) => Promise<void>;

    avisoInputRef: React.RefObject<HTMLInputElement | null>;
}) {
    // -------- Modal edição de aviso ----------
    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editId, setEditId] = useState<number | string | null>(null);
    const [editTag, setEditTag] = useState<"Serviço" | "Geral">("Geral");
    const [editText, setEditText] = useState("");

    const avisosAtivos = useMemo(() => {
        return (avisos ?? []).filter((a: any) => Number(a?.finalizado ?? 0) !== 1);
    }, [avisos]);

    const openEdit = (a: any) => {
        const { tag, text } = parseAvisoMensagem(a?.mensagem);
        setEditId(a?.id);
        setEditTag(tag);
        setEditText(text);
        setEditOpen(true);
    };

    const closeEdit = () => {
        if (editLoading) return;
        setEditOpen(false);
        setEditId(null);
        setEditText("");
    };

    const submitEdit = async () => {
        if (editId == null) return;

        const t = editText.trim();
        if (!t) {
            setAvisoMsg({ ok: false, text: "Digite um texto para salvar." });
            return;
        }

        setEditLoading(true);
        try {
            const prefix = editTag === "Serviço" ? TAG_SERVICO : TAG_GERAL;
            await editarAviso(editId, `${prefix} ${t}`);
            setAvisoMsg({ ok: true, text: "Aviso atualizado!" });
            closeEdit();
        } catch (e: any) {
            setAvisoMsg({ ok: false, text: e?.message || "Erro ao editar!" });
        } finally {
            setEditLoading(false);
        }
    };

    return (
        <section className="space-y-4">
            {/* Atendimentos */}
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Atendimentos</h2>
                    <span className="text-sm text-muted-foreground">{registros?.length ?? 0} ativo(s)</span>
                </div>

                <div className="mt-3 space-y-2">
                    {(registros ?? []).map((r: any) => (
                        <div
                            key={String(r?.id)}
                            className="rounded-xl border bg-background/60 p-3 sm:p-4"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="font-semibold break-words [overflow-wrap:anywhere]">
                                        {String(r?.falecido ?? "")}
                                    </div>
                                    <div className="mt-1 text-[14px] text-muted-foreground">
                                        Status: {String(r?.status ?? "")}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600"
                                    onClick={() => onAddObservacao(String(r?.id))}
                                >
                                    Adicionar Observação
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Enviar Aviso Geral */}
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Aviso Geral</h2>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        ref={avisoInputRef as React.RefObject<HTMLInputElement>}
                        type="text"
                        maxLength={255}
                        placeholder="Digite um aviso..."
                        className="w-full flex-1 rounded-xl border px-3 py-2 text-[16px]"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") enviarAviso();
                        }}
                    />

                    <button
                        type="button"
                        className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600"
                        onClick={enviarAviso}
                    >
                        Enviar
                    </button>
                </div>

                {avisoMsg ? (
                    <div className="mt-2">
                        <TextFeedback kind={avisoMsg.ok ? "success" : "error"}>
                            {avisoMsg.text}
                        </TextFeedback>
                    </div>
                ) : null}
            </div>

            {/* Avisos */}
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Avisos Ativos</h2>

                <div className="mt-3 space-y-2">
                    {avisosAtivos.length === 0 ? (
                        <div className="rounded-xl border bg-background/60 p-4 text-sm text-muted-foreground">
                            Nenhum aviso no momento.
                        </div>
                    ) : (
                        avisosAtivos.map((a: any) => {
                            const { tag, text } = parseAvisoMensagem(a?.mensagem);
                            const usuario = String(a?.usuario ?? "").trim();
                            const criadoEm = a?.criado_em ? new Date(a.criado_em).toLocaleString() : "";

                            return (
                                <div key={String(a?.id)} className="rounded-xl border bg-background/60 p-3 sm:p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <TagChip kind={tag} />
                                        {usuario ? (
                                            <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[12px]">
                                                {usuario}
                                            </span>
                                        ) : null}

                                        {criadoEm ? (
                                            <span className="text-[12px] text-muted-foreground">{criadoEm}</span>
                                        ) : null}
                                    </div>

                                    <div className="mt-2 text-[16px] leading-relaxed break-words [overflow-wrap:anywhere]">
                                        {text}
                                    </div>

                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <button
                                            type="button"
                                            className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600"
                                            onClick={() => openEdit(a)}
                                        >
                                            Editar
                                        </button>

                                        <button
                                            type="button"
                                            className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600"
                                            onClick={() => excluirAviso(a?.id)}
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal editar aviso */}
            <Modal
                open={editOpen}
                title="Editar aviso"
                subtitle={editTag ? `Tipo: ${editTag}` : undefined}
                onClose={closeEdit}
                disableClose={editLoading}
            >
                <label className="block text-[14px] font-medium text-muted-foreground">Texto</label>
                <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={5}
                    maxLength={255}
                    className="mt-2 w-full rounded-xl border px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="Digite o aviso..."
                />

                <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                    <button
                        type="button"
                        className="w-full sm:w-auto rounded-xl border px-4 py-2 text-[14px] hover:bg-muted disabled:opacity-60"
                        onClick={closeEdit}
                        disabled={editLoading}
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                        onClick={submitEdit}
                        disabled={editLoading}
                    >
                        {editLoading ? "Salvando..." : "Salvar"}
                    </button>
                </div>
            </Modal>
        </section>
    );
}