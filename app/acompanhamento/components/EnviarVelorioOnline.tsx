"use client";

import React, { useState } from "react";
import {
    IconBrandWhatsapp,
    IconAlertTriangle,
    IconCircleCheck,
} from "@tabler/icons-react";
import type { Registro } from "./types";

type SalaKey = "sala_01" | "sala_02" | "sala_03";

const btnClass =
    "w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white " +
    "hover:bg-emerald-700 disabled:opacity-60 disabled:pointer-events-none";

const alertBase = "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs";

function normalizarTextoSenha(texto?: string) {
    const normalizado = String(texto ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    return normalizado;
}

function primeiroNomeSenha(nomeCompleto?: string) {
    const nome = normalizarTextoSenha(nomeCompleto);
    if (!nome) return "";

    return nome.split(/\s+/)[0] || "";
}

function salaToKey(sala?: string): SalaKey | "" {
    const s = String(sala ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    if (s === "sala 01" || s === "sala 1" || s === "01" || s === "1") {
        return "sala_01";
    }

    if (s === "sala 02" || s === "sala 2" || s === "02" || s === "2") {
        return "sala_02";
    }

    if (s === "sala 03" || s === "sala 3" || s === "03" || s === "3") {
        return "sala_03";
    }

    return "";
}

function salaKeyToUrl(sala: SalaKey) {
    const salaFormatada = sala.replace("_", "-");

    return `https://planoassistencialintegrado.com.br/velorio-online-${salaFormatada}/`;
}

function salaKeyToTitulo(sala: SalaKey) {
    if (sala === "sala_01") return "Sala 01";
    if (sala === "sala_02") return "Sala 02";
    return "Sala 03";
}

function isVelorioOnlineSim(v?: string) {
    const s = String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return s === "sim" || s === "s" || s === "1" || s === "true";
}

function buildWhatsappUrl(sala: SalaKey, senha: string) {
    const link = salaKeyToUrl(sala);

    const texto =
        `Acesso Ao Sistema Velório Online - Plano PAI:\n\n` +
        `Link de acesso: ${link}\n` +
        `Senha: ${senha}`;

    return `https://api.whatsapp.com/send/?text=${encodeURIComponent(texto)}`;
}

export default function EnviarVelorioOnline({
    registro,
}: {
    registro?: Registro | null;
}) {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleEnviarAcesso = async () => {
        try {
            setMsg(null);
            setLoading(true);

            if (!registro) {
                throw new Error("Nenhum atendimento selecionado.");
            }

            const sala = salaToKey((registro as any).sala_velorio);

            if (!sala) {
                throw new Error("Este atendimento não possui Sala do Velório válida.");
            }

            if (!isVelorioOnlineSim((registro as any).velorio_online)) {
                throw new Error("Este atendimento não está marcado como Velório Online.");
            }

            const senha = primeiroNomeSenha(
                (registro as any).falecido ||
                (registro as any).nome_completo ||
                (registro as any).nome_falecido
            );

            if (!senha) {
                throw new Error("Não foi possível gerar a senha pelo primeiro nome do falecido.");
            }

            const wa = buildWhatsappUrl(sala, senha);

            window.open(wa, "_blank", "noopener,noreferrer");

            setMsg({
                type: "success",
                text: `Link da ${salaKeyToTitulo(sala)} preparado no WhatsApp.`,
            });
        } catch (e: any) {
            console.error(e);

            setMsg({
                type: "error",
                text: e?.message || "Não foi possível preparar o acesso ao velório online.",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={handleEnviarAcesso}
                disabled={loading}
                className={btnClass}
                aria-busy={loading}
                title="Gerar mensagem de acesso no WhatsApp"
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
                        <IconBrandWhatsapp className="size-5" />
                        Enviar Velório Online
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