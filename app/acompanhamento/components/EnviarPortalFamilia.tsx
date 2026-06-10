"use client";

import React, { useState } from "react";
import {
    IconBrandWhatsapp,
    IconAlertTriangle,
    IconCircleCheck,
    IconUsers,
} from "@tabler/icons-react";
import type { Registro } from "./types";

const PORTAL_FAMILIA_URL = "https://planoassistencialintegrado.com.br/portal-da-familia/";

const btnClass =
    "w-full inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white " +
    "hover:bg-violet-800 disabled:opacity-60 disabled:pointer-events-none";

const alertBase = "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs";

function onlyDigits(v?: string | number | null) {
    return String(v ?? "").replace(/\D+/g, "");
}

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

function getCpfResponsavel(registro?: Registro | null) {
    return onlyDigits(
        (registro as any)?.cpf_responsavel ||
        (registro as any)?.responsavel_cpf ||
        ""
    );
}

function buildPortalLink(id: string) {
    return `${PORTAL_FAMILIA_URL}?id=${encodeURIComponent(id)}`;
}

function buildWhatsappUrl(registro: Registro) {
    const id = String((registro as any)?.id ?? "").trim();

    if (!id) {
        throw new Error("Este atendimento não possui ID válido para gerar o link.");
    }

    const link = buildPortalLink(id);
    const falecido = getNomeFalecido(registro);
    const responsavel = getResponsavel(registro);
    const cpf = getCpfResponsavel(registro);

    const senha = cpf.length >= 6 ? cpf.slice(0, 6) : "";

    if (!senha) {
        throw new Error("Este atendimento não possui CPF do responsável válido para gerar a senha.");
    }

    const texto =
        `Portal da Família PAI\n\n` +
        `Olá${responsavel ? `, ${responsavel}` : ""}.\n\n` +
        `Segue o acesso ao Portal da Família referente ao atendimento de ${falecido}.\n\n` +
        `Link de acesso:\n${link}\n\n` +
        `Senha: ${senha}\n\n` +
        `A senha corresponde aos 6 primeiros números do CPF do responsável familiar.`;

    return `https://api.whatsapp.com/send/?text=${encodeURIComponent(texto)}`;
}

export default function EnviarPortalFamilia({
    registro,
}: {
    registro?: Registro | null;
}) {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleEnviarPortal = () => {
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
                text: "Link do Portal da Família preparado no WhatsApp.",
            });
        } catch (e: any) {
            console.error(e);

            setMsg({
                type: "error",
                text: e?.message || "Não foi possível preparar o link do Portal da Família.",
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
                onClick={handleEnviarPortal}
                disabled={loading}
                aria-busy={loading}
                title="Enviar link do Portal da Família pelo WhatsApp"
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
                        <IconUsers className="size-5" />
                        <IconBrandWhatsapp className="size-5" />
                        Enviar Portal da Família
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