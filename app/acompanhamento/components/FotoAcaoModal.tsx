"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import TextFeedback from "./TextFeedback";
import type { Registro } from "./types";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

export type FotoAcaoTipo = "fim_ornamentacao" | "entrega_corpo";

type FotoAcaoFase = "fase06" | "fase08";

function getTitulo(tipo?: FotoAcaoTipo | null) {
    if (tipo === "fim_ornamentacao") return "ANEXE A FOTO";
    if (tipo === "entrega_corpo") return "ANEXE A FOTO";
    return "ANEXE A FOTO";
}

function getSubtitulo(tipo?: FotoAcaoTipo | null) {
    if (tipo === "fim_ornamentacao") return "Foto obrigatória para confirmar o Fim da Ornamentação.";
    if (tipo === "entrega_corpo") return "Foto obrigatória para confirmar a Entrega de Corpo.";
    return "Foto obrigatória para confirmar esta ação.";
}

function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}

async function salvarFotoAcao({
    id,
    tipo,
    base64,
}: {
    id: string | number;
    tipo: FotoAcaoTipo;
    base64: string;
}) {
    const res = await fetch(`${ENDPOINT}/informativo.php`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            acao: "salvar_foto_acao",
            id,
            tipo,
            base64,
        }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.sucesso) {
        throw new Error(data?.msg || `Erro HTTP ${res.status} ao salvar a foto.`);
    }

    return data as {
        sucesso: true;
        url?: string;
        path?: string;
    };
}

export default function FotoAcaoModal({
    open,
    onClose,
    registro,
    registroId,
    fase,
    tipo,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;

    /**
     * Pode mandar o registro inteiro ou apenas registroId.
     * Mantive os dois para facilitar a integração no page.tsx.
     */
    registro?: Registro | null;
    registroId?: string | number | null;

    fase?: FotoAcaoFase | string | null;
    tipo?: FotoAcaoTipo | null;

    /**
     * Chamado depois que a foto é salva no PHP.
     * No page.tsx, aqui você chama registrarAcao(fase, { skipConfirm: true })
     * ou registrarAcao(fase), conforme o seu fluxo.
     */
    onSaved: (payload: {
        id: string | number;
        fase: FotoAcaoFase | string;
        tipo: FotoAcaoTipo;
        url?: string;
        path?: string;
    }) => void | Promise<void>;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const [preview, setPreview] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const resolvedId = registroId ?? registro?.id ?? null;

    useEffect(() => {
        if (!open) return;

        setPreview("");
        setSaving(false);
        setMsg(null);

        /**
         * ✅ Obrigatório abrir a câmera direto.
         * Em celulares, input file com capture="environment" abre a câmera traseira.
         * O setTimeout ajuda iOS/Android a abrir depois que o modal renderiza.
         */
        const t = setTimeout(() => {
            try {
                inputRef.current?.click();
            } catch {
                // noop
            }
        }, 250);

        return () => clearTimeout(t);
    }, [open, registroId, registro?.id, fase, tipo]);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        setMsg(null);

        const file = e.target.files?.[0];
        if (!file) {
            setPreview("");
            return;
        }

        if (!file.type.startsWith("image/")) {
            setPreview("");
            setMsg({ ok: false, text: "Selecione uma imagem válida." });
            return;
        }

        try {
            const dataUrl = await fileToDataURL(file);
            setPreview(dataUrl);
        } catch {
            setPreview("");
            setMsg({ ok: false, text: "Não foi possível carregar a foto." });
        }
    }

    async function handleSalvar() {
        if (saving) return;

        setMsg(null);

        if (!resolvedId) {
            setMsg({ ok: false, text: "Registro inválido. Feche e tente novamente." });
            return;
        }

        if (!tipo) {
            setMsg({ ok: false, text: "Tipo da foto não informado." });
            return;
        }

        if (!fase) {
            setMsg({ ok: false, text: "Fase da ação não informada." });
            return;
        }

        if (!preview) {
            setMsg({ ok: false, text: "A foto é obrigatória. Toque em Abrir câmera e tire a foto." });
            return;
        }

        try {
            setSaving(true);

            const saved = await salvarFotoAcao({
                id: resolvedId,
                tipo,
                base64: preview,
            });

            setMsg({ ok: true, text: "Foto salva com sucesso. Confirmando ação..." });

            await onSaved({
                id: resolvedId,
                fase,
                tipo,
                url: saved.url,
                path: saved.path,
            });

            onClose();
        } catch (e: any) {
            setMsg({
                ok: false,
                text: e?.message || "Falha ao salvar a foto.",
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={saving ? () => { } : onClose} ariaLabel="Anexar foto da ação" maxWidth={520}>
            <div>
                <h2 className="text-xl font-semibold">{getTitulo(tipo)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{getSubtitulo(tipo)}</p>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                />

                <div className="mt-4">
                    {preview ? (
                        <div className="overflow-hidden rounded-xl border bg-muted/30">
                            <img
                                src={preview}
                                alt="Foto anexada"
                                className="max-h-[360px] w-full object-contain"
                            />
                        </div>
                    ) : (
                        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                            Nenhuma foto anexada ainda.
                            <br />
                            Toque em “Abrir câmera” para tirar a foto.
                        </div>
                    )}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <button
                        type="button"
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        disabled={saving}
                        onClick={() => inputRef.current?.click()}
                    >
                        Abrir câmera
                    </button>

                    <button
                        type="button"
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        disabled={saving}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                        disabled={saving || !preview}
                        onClick={handleSalvar}
                    >
                        {saving ? "Salvando..." : "Salvar"}
                    </button>
                </div>

                {msg && <TextFeedback kind={msg.ok ? "success" : "error"}>{msg.text}</TextFeedback>}
            </div>
        </Modal>
    );
}