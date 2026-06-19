"use client";

import React, { useState } from "react";
import {
    IconBrandWhatsapp,
    IconAlertTriangle,
    IconCircleCheck,
    IconSparkles,
} from "@tabler/icons-react";
import type { Registro } from "./types";

const LEGADO_LUZ_URL = "https://planoassistencialintegrado.com.br/legado-de-luz/";

const btnClass =
    "w-full inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white " +
    "hover:bg-amber-700 disabled:opacity-60 disabled:pointer-events-none";

const alertBase = "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs";

function getNomeFalecido(registro?: Registro | null) {
    return String(
        (registro as any)?.falecido ||
        (registro as any)?.nome_completo ||
        (registro as any)?.nome_falecido ||
        "Atendimento"
    ).trim();
}

function getResponsavel(registro?: Registro | null) {
    return String(
        (registro as any)?.nome_responsavel ||
        (registro as any)?.responsavel ||
        ""
    ).trim();
}

function limparCodigo(codigo?: string | number | null) {
    return String(codigo ?? "")
        .trim()
        .replace(/^\/+|\/+$/g, "");
}

function getCodigoHomenagem(registro?: Registro | null) {
    const r = registro as any;

    return limparCodigo(
        r?.codigo_homenagem ||
        r?.homenagem_codigo ||
        r?.homenagem_slug ||
        r?.slug_homenagem ||
        r?.legado_luz_codigo ||
        r?.legado_luz_slug
    );
}

function getAtendimentoId(registro?: Registro | null) {
    const r = registro as any;

    return String(
        r?.legado_luz_atendimento_id ||
        r?.atendimento_id ||
        r?.id ||
        ""
    ).trim();
}

function getLinkPublicoHomenagem(registro?: Registro | null) {
    const r = registro as any;

    // Correção principal:
    // o Legado de Luz agora deve ser enviado pelo ID do atendimento.
    // Assim, se o nome/slug do falecido for corrigido, o link continua o mesmo.
    const atendimentoId = getAtendimentoId(registro);

    if (atendimentoId) {
        return `${LEGADO_LUZ_URL}?atendimento_id=${encodeURIComponent(atendimentoId)}`;
    }

    // Compatibilidade temporária para registros antigos sem ID disponível.
    // Só usa o slug/código se não houver ID do atendimento.
    const codigo = getCodigoHomenagem(registro);

    if (codigo) {
        return `${LEGADO_LUZ_URL}?codigo=${encodeURIComponent(codigo)}`;
    }

    // Último fallback: links antigos retornados pela API.
    // Mantido apenas para não quebrar registros que ainda não vierem com ID.
    const linkExistente = String(
        r?.legado_luz_link ||
        r?.homenagem_link_publico ||
        r?.link_homenagem ||
        r?.link_publico ||
        ""
    ).trim();

    if (linkExistente && /^https?:\/\//i.test(linkExistente)) {
        return linkExistente;
    }

    return "";
}

function buildWhatsappUrl(registro: Registro) {
    const link = getLinkPublicoHomenagem(registro);

    if (!link) {
        throw new Error(
            "Este atendimento ainda não possui ID válido para gerar o link do Legado de Luz."
        );
    }

    const falecido = getNomeFalecido(registro);
    const responsavel = getResponsavel(registro);

    const texto =
        `Legado de Luz - Plano PAI\n\n` +
        `Olá${responsavel ? `, ${responsavel}` : ""}.\n\n` +
        `Segue o link da página de homenagens de ${falecido}.\n\n` +
        `Acesse e compartilhe suas memórias, mensagens, fotos, áudios e vídeos:\n${link}`;

    return `https://api.whatsapp.com/send/?text=${encodeURIComponent(texto)}`;
}

export default function EnviarLegadoLuz({
    registro,
}: {
    registro?: Registro | null;
}) {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleEnviarLegado = () => {
        try {
            setMsg(null);
            setLoading(true);

            if (!registro) {
                throw new Error("Nenhum atendimento selecionado.");
            }

            const wa = buildWhatsappUrl(registro);

            window.open(wa, "_blank", "noopener,noreferrer");

            setMsg({
                type: "success",
                text: "Link do Legado de Luz preparado no WhatsApp.",
            });
        } catch (e: any) {
            console.error(e);

            setMsg({
                type: "error",
                text: e?.message || "Não foi possível preparar o link do Legado de Luz.",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                className={btnClass}
                onClick={handleEnviarLegado}
                disabled={loading}
                aria-busy={loading}
                title="Enviar link do Legado de Luz pelo WhatsApp"
            >
                {loading ? (
                    <>
                        <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            />
                        </svg>
                        Preparando…
                    </>
                ) : (
                    <>
                        <IconSparkles className="size-5" />
                        <IconBrandWhatsapp className="size-5" />
                        Enviar Legado de Luz
                    </>
                )}
            </button>

            {msg && (
                <div
                    className={`${alertBase} ${msg.type === "success"
                        ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                        : "border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                        }`}
                    role="status"
                >
                    {msg.type === "success" ? (
                        <IconCircleCheck className="mt-[1px] size-4 shrink-0" />
                    ) : (
                        <IconAlertTriangle className="mt-[1px] size-4 shrink-0" />
                    )}

                    <span>{msg.text}</span>
                </div>
            )}
        </div>
    );
}
