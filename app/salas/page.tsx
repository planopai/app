"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
    IconDoor,
    IconShieldLock,
    IconBrandWhatsapp,
    IconExternalLink,
    IconAlertTriangle,
    IconCircleCheck,
} from "@tabler/icons-react";

type SalaKey = "sala_01" | "sala_02" | "sala_03";

const GET_SENHA_ENDPOINT = "/api/php/get_senha.php"; // se precisar proxy, troque por /api/php/get_senha

const btnOutline =
    "inline-flex items-center justify-center rounded-md border px-4 py-2 text-base font-semibold " +
    "border-primary text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50 disabled:pointer-events-none";

const btnOutlineAlt =
    "inline-flex items-center justify-center rounded-md border px-4 py-2 text-base font-semibold " +
    "border-secondary text-secondary hover:bg-secondary/10 active:bg-secondary/20 disabled:opacity-50 disabled:pointer-events-none";

export default function AcessoCompartilhamentoPage() {
    const [loadingSala, setLoadingSala] = useState<SalaKey | null>(null);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const salas = useMemo(
        () => [
            {
                key: "sala_01" as SalaKey,
                title: "Sala 01",
                url: "https://planoassistencialintegrado.com.br/velorio-online-sala-01/",
            },
            {
                key: "sala_02" as SalaKey,
                title: "Sala 02",
                url: "https://planoassistencialintegrado.com.br/velorio-online-sala-02/",
            },
            {
                key: "sala_03" as SalaKey,
                title: "Sala 03",
                url: "https://planoassistencialintegrado.com.br/velorio-online-sala-03/",
            },
        ],
        []
    );

    const buildWhatsappUrl = (sala: SalaKey, senha: string) => {
        const salaFormatada = sala.replace("_", "-");
        const texto = `Acesso Ao Sistema Velório Online - Plano PAI: Link de acesso: https://planoassistencialintegrado.com.br/velorio-online-${salaFormatada}/ Senha: ${senha}`;
        const encoded = encodeURIComponent(texto);
        return `https://api.whatsapp.com/send/?text=${encoded}`;
    };

    const handleEnviarAcesso = useCallback(async (sala: SalaKey) => {
        try {
            setMsg(null);
            setLoadingSala(sala);
            const url = `${GET_SENHA_ENDPOINT}?sala=${sala}&_=${Date.now()}`;
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
            const senha = (await res.text()).trim();

            if (!senha) throw new Error("Senha vazia retornada pela API.");

            const wa = buildWhatsappUrl(sala, senha);
            window.open(wa, "_blank");

            setMsg({ type: "success", text: "Link de acesso preparado no WhatsApp." });
        } catch (e) {
            console.error(e);
            setMsg({ type: "error", text: "Não foi possível obter a senha. Tente novamente." });
        } finally {
            setLoadingSala(null);
        }
    }, []);

    return (
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
            {/* Título simples */}
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Acesso e Compartilhamento</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Entre nas salas ou gere rapidamente um link de WhatsApp com a senha atual.
                </p>
            </header>

            {/* Grid de Salas */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {salas.map((sala) => (
                    <div
                        key={sala.key}
                        className="rounded-2xl border bg-card/60 p-5 shadow-sm backdrop-blur transition hover:shadow-md"
                    >
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-xl border p-2">
                                <IconDoor className="size-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold leading-tight">{sala.title}</h3>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                    <IconShieldLock className="size-4" />
                                    <span>Protegida por senha</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3">
                            <a
                                href={sala.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={btnOutline + " gap-2"}
                            >
                                <IconExternalLink className="size-5" />
                                Acessar Sala
                            </a>

                            <button
                                onClick={() => handleEnviarAcesso(sala.key)}
                                disabled={loadingSala === sala.key}
                                className={btnOutlineAlt + " gap-2"}
                            >
                                {loadingSala === sala.key ? (
                                    <>
                                        <svg className="size-4 animate-spin" viewBox="0 0 24 24">
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
                                        Enviar Acesso
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Alertas */}
            {msg && (
                <div
                    className={`mt-6 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${msg.type === "success"
                            ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                            : "border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                        }`}
                    role="status"
                >
                    {msg.type === "success" ? (
                        <IconCircleCheck className="mt-[2px] size-4" />
                    ) : (
                        <IconAlertTriangle className="mt-[2px] size-4" />
                    )}
                    <span>{msg.text}</span>
                </div>
            )}

            {/* Notas finais */}
            <div className="mt-6 text-xs text-muted-foreground">
                <p>
                    • Se o endpoint PHP estiver em outro domínio, use um proxy (ex.: <b>/api/php/get_senha</b>)
                    para evitar CORS.
                </p>
                <p>• Em produção, prefira sempre HTTPS completo para todas as chamadas.</p>
            </div>
        </div>
    );
}
