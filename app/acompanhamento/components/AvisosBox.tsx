"use client";

import React, { useMemo } from "react";
import type { Aviso, Registro } from "./types";
import TextFeedback from "./TextFeedback";
import EditableText from "./EditableText";

const TAG_SERVICO = "[Serviço]";
const TAG_GERAL = "[Geral]";

function getTagKind(msg?: any): "servico" | "geral" | "none" {
    const s = String(msg ?? "");
    if (s.startsWith(TAG_SERVICO)) return "servico";
    if (s.startsWith(TAG_GERAL)) return "geral";
    return "none";
}

function stripTag(msg?: any) {
    const s = String(msg ?? "");
    if (s.startsWith(TAG_SERVICO)) return s.slice(TAG_SERVICO.length).trim();
    if (s.startsWith(TAG_GERAL)) return s.slice(TAG_GERAL.length).trim();
    return s.trim();
}

function TagBadge({ kind }: { kind: "servico" | "geral" | "none" }) {
    if (kind === "none") return null;

    const label = kind === "servico" ? "Serviço" : "Geral";
    const cls =
        kind === "servico"
            ? "bg-sky-100 text-sky-700 border-sky-200"
            : "bg-slate-100 text-slate-700 border-slate-200";

    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
            {label}
        </span>
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
    finalizarAviso,
    avisoInputRef,
}: {
    avisos: Aviso[];

    // ✅ lista do quadro (filtrada/ordenada no page.tsx)
    registros: Registro[];
    onAddObservacao: (registroId: string) => void;

    avisoMsg: { text: string; ok: boolean } | null;
    setAvisoMsg: (m: { text: string; ok: boolean } | null) => void;

    enviarAviso: () => Promise<void>;
    editarAviso: (id: number | string, mensagem: string) => Promise<void>;
    excluirAviso: (id: number | string) => Promise<void>;
    finalizarAviso: (id: number | string) => Promise<void>;

    avisoInputRef: React.RefObject<HTMLInputElement | null>;
}) {
    const regs = Array.isArray(registros) ? registros : [];
    const avisosAtivos = useMemo(() => {
        return (avisos ?? []).filter((a: any) => a?.finalizado !== 1);
    }, [avisos]);

    return (
        <section className="rounded-2xl border bg-card/60 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg sm:text-xl font-semibold">Avisos do Plantão</h2>
                <p className="text-sm text-muted-foreground">
                    Adicione um aviso geral ou registre uma observação vinculada a um atendimento.
                </p>
            </div>

            {/* ===== Atendimentos no Quadro ===== */}
            <div className="mt-4 rounded-2xl border bg-background/60 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Atendimentos no Quadro</h3>
                    <span className="text-xs text-muted-foreground">{regs.length} ativo(s)</span>
                </div>

                <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
                    {regs.length === 0 ? (
                        <div className="rounded-xl border bg-background p-3 text-sm text-muted-foreground">
                            Nenhum atendimento ativo no quadro.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {regs.map((r: any) => {
                                const id = String(r?.id ?? "");
                                const nome = String(r?.falecido ?? "").trim() || "Falecido(a) não informado";
                                const status = String(r?.status ?? "").trim();

                                return (
                                    <div
                                        key={id}
                                        className="rounded-xl border bg-background p-3 sm:p-4"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                            {/* Esquerda: Nome + Status */}
                                            <div className="min-w-0">
                                                <div className="text-sm sm:text-base font-semibold leading-snug break-words [overflow-wrap:anywhere]">
                                                    {nome}
                                                </div>
                                                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                                                    Status: <span className="font-medium text-foreground/80">{status || "a definir"}</span>
                                                </div>
                                            </div>

                                            {/* Direita: Botão */}
                                            <div className="shrink-0">
                                                <button
                                                    type="button"
                                                    className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                                                    onClick={() => onAddObservacao(id)}
                                                >
                                                    Adicionar Observação
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== Input Aviso Geral ===== */}
            <div className="mt-4 rounded-2xl border bg-background/60 p-3 sm:p-4">
                <div className="text-sm font-semibold">Aviso Geral</div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                        ref={avisoInputRef as React.RefObject<HTMLInputElement>}
                        type="text"
                        maxLength={255}
                        placeholder="Digite um aviso..."
                        className="w-full flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") enviarAviso();
                        }}
                    />

                    <button
                        type="button"
                        className="w-full sm:w-auto rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        onClick={enviarAviso}
                    >
                        Enviar
                    </button>
                </div>

                <div className="mt-2">
                    {avisoMsg && (
                        <TextFeedback kind={avisoMsg.ok ? "success" : "error"}>
                            {avisoMsg.text}
                        </TextFeedback>
                    )}
                </div>
            </div>

            {/* ===== Lista de Avisos ===== */}
            <div className="mt-4">
                <div className="text-sm font-semibold">Avisos Ativos</div>

                <ul className="mt-3 space-y-2">
                    {avisosAtivos.length === 0 ? (
                        <li className="rounded-xl border bg-background p-3 text-sm text-muted-foreground">
                            Nenhum aviso no momento.
                        </li>
                    ) : (
                        avisosAtivos.map((a: any) => {
                            const kind = getTagKind(a?.mensagem);
                            const msg = stripTag(a?.mensagem);

                            return (
                                <li
                                    key={String(a?.id ?? Math.random())}
                                    className="rounded-xl border bg-background p-3 sm:p-4"
                                >
                                    <div className="flex flex-col gap-2">
                                        {/* Header */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <TagBadge kind={kind} />
                                            {a?.usuario ? (
                                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                                    {a.usuario}
                                                </span>
                                            ) : null}

                                            <span className="ml-auto text-[11px] text-muted-foreground">
                                                {a?.criado_em ? new Date(a.criado_em).toLocaleString() : ""}
                                            </span>
                                        </div>

                                        {/* Conteúdo */}
                                        <div className="min-w-0">
                                            <EditableText
                                                text={msg}
                                                onSave={(t) => {
                                                    // mantém o prefixo ao salvar (pra não perder a tag)
                                                    const prefix = kind === "servico" ? TAG_SERVICO : kind === "geral" ? TAG_GERAL : "";
                                                    return editarAviso(a.id, prefix ? `${prefix} ${t}` : t);
                                                }}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Ações */}
                                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                                            <button
                                                className="w-full sm:w-auto rounded-xl border px-3 py-2 text-sm hover:bg-muted"
                                                onClick={() => excluirAviso(a.id)}
                                            >
                                                Excluir
                                            </button>
                                            <button
                                                className="w-full sm:w-auto rounded-xl border px-3 py-2 text-sm hover:bg-muted"
                                                onClick={() => finalizarAviso(a.id)}
                                            >
                                                Finalizar
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            );
                        })
                    )}
                </ul>
            </div>
        </section>
    );
}