"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
    IconLock,
    IconEye,
    IconEyeClosed,
    IconKey,
    IconRefresh,
    IconCircleCheck,
    IconAlertTriangle,
    IconKey as IconKeyLine,
    IconDoor,
} from "@tabler/icons-react";

type SalaKey = "sala_01" | "sala_02" | "sala_03";

const ADMIN_ENDPOINT = "https://planoassistencialintegrado.com.br/admin.php"; // ou "/api/php/admin" se usar proxy

// botões outline
const btnPrimaryOutline =
    "inline-flex items-center justify-center rounded-lg border px-4 py-2 text-base font-semibold " +
    "border-primary text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50";

const btnSecondaryOutline =
    "inline-flex items-center justify-center rounded-lg border px-4 py-2 text-base font-semibold " +
    "border-secondary text-secondary hover:bg-secondary/10 active:bg-secondary/20 disabled:opacity-50";

// botão de sala (ativo x inativo)
function RoomButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={[
                "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 font-semibold transition",
                active
                    ? "border-primary/70 bg-primary/5 text-primary ring-1 ring-primary/30"
                    : "border-muted text-foreground hover:bg-muted/40",
            ].join(" ")}
        >
            <IconDoor className="size-4" />
            {label}
        </button>
    );
}

export default function SegurancaPage() {
    const [sala, setSala] = useState<SalaKey>("sala_01");
    const [senha, setSenha] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState<"update" | "reset" | null>(null);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const salas = useMemo(
        () => [
            { label: "Sala 01", value: "sala_01" as SalaKey },
            { label: "Sala 02", value: "sala_02" as SalaKey },
            { label: "Sala 03", value: "sala_03" as SalaKey },
        ],
        []
    );

    const gerarAleatoria = () => {
        const s = Math.random().toString(36).slice(2, 8).toUpperCase();
        setSenha(s);
        setMsg(null);
    };

    const atualizarSenha = useCallback(async () => {
        if (!senha.trim()) {
            setMsg({ type: "error", text: "Por favor, insira uma nova senha." });
            return;
        }
        try {
            setLoading("update");
            setMsg(null);
            const body = new URLSearchParams({ sala, senha: senha.trim(), update: "true" });
            const res = await fetch(ADMIN_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
                cache: "no-store",
            });
            if (!res.ok) throw new Error(await res.text());
            setMsg({ type: "success", text: "Senha atualizada com sucesso!" });
            setSenha("");
        } catch (e) {
            console.error(e);
            setMsg({ type: "error", text: "Ocorreu um erro ao atualizar a senha." });
        } finally {
            setLoading(null);
        }
    }, [sala, senha]);

    const resetarSenha = useCallback(async () => {
        try {
            setLoading("reset");
            setMsg(null);
            const body = new URLSearchParams({ sala, reset: "true" });
            const res = await fetch(ADMIN_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
                cache: "no-store",
            });
            if (!res.ok) throw new Error(await res.text());
            setMsg({ type: "success", text: "Senha resetada para o padrão!" });
        } catch (e) {
            console.error(e);
            setMsg({ type: "error", text: "Ocorreu um erro ao resetar a senha." });
        } finally {
            setLoading(null);
        }
    }, [sala]);

    const strength = useMemo(() => {
        let score = 0;
        if (senha.length >= 6) score++;
        if (/[A-Z]/.test(senha)) score++;
        if (/[0-9]/.test(senha)) score++;
        return score; // 0..3
    }, [senha]);

    return (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
            {/* Topbar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Definição de Senhas</h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie as senhas das salas com segurança e praticidade.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={gerarAleatoria}
                        className={btnSecondaryOutline + " gap-2"}
                        title="Gerar senha aleatória"
                    >
                        <IconKey className="size-4" />
                        Gerar Aleatória
                    </button>
                </div>
            </div>

            {/* Card: Escolher sala */}
            <div className="mb-5 rounded-2xl border bg-card/60 p-3 sm:p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                    <IconLock className="size-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Escolha a Sala</h2>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {salas.map((s) => (
                        <RoomButton
                            key={s.value}
                            label={s.label}
                            active={sala === s.value}
                            onClick={() => setSala(s.value)}
                        />
                    ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    A senha definida será aplicada para a sala selecionada.
                </p>
            </div>

            {/* Card: Nova senha */}
            <div className="rounded-2xl border bg-card/60 shadow-sm">
                <div className="p-5 sm:p-6">
                    <div className="mb-2 flex items-center gap-2">
                        <IconKeyLine className="size-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Nova Senha</h2>
                    </div>

                    <div className="relative max-w-md">
                        <input
                            type={showPass ? "text" : "password"}
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            placeholder="Digite a nova senha"
                            className="input pr-[88px] text-base"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPass((v) => !v)}
                            className="absolute right-10 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                            title={showPass ? "Ocultar" : "Mostrar"}
                        >
                            {showPass ? <IconEyeClosed className="size-5" /> : <IconEye className="size-5" />}
                        </button>
                        <button
                            type="button"
                            onClick={gerarAleatoria}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                            title="Gerar senha aleatória"
                        >
                            <IconKey className="size-5" />
                        </button>
                    </div>

                    {/* força */}
                    <div className="mt-3 max-w-md">
                        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                            <div className={`${strength >= 1 ? "bg-amber-400" : "bg-transparent"}`} style={{ width: "33.33%" }} />
                            <div className={`${strength >= 2 ? "bg-blue-500" : "bg-transparent"}`} style={{ width: "33.33%" }} />
                            <div className={`${strength >= 3 ? "bg-green-500" : "bg-transparent"}`} style={{ width: "33.33%" }} />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500/70" />
                            Dica: use 6–8 caracteres fáceis de comunicar por telefone.
                        </div>
                    </div>

                    {/* ações */}
                    <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                        <button
                            onClick={resetarSenha}
                            disabled={loading === "reset"}
                            className={btnSecondaryOutline + " min-w-[180px] gap-2"}
                        >
                            {loading === "reset" ? (
                                <>
                                    <svg className="size-4 animate-spin" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Resetando…
                                </>
                            ) : (
                                <>
                                    <IconRefresh className="size-5" />
                                    Resetar Senha
                                </>
                            )}
                        </button>

                        <button
                            onClick={atualizarSenha}
                            disabled={loading === "update"}
                            className={btnPrimaryOutline + " min-w-[180px] gap-2"}
                        >
                            {loading === "update" ? (
                                <>
                                    <svg className="size-4 animate-spin" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Salvando…
                                </>
                            ) : (
                                <>
                                    <IconCircleCheck className="size-5" />
                                    Atualizar Senha
                                </>
                            )}
                        </button>
                    </div>

                    {/* alertas */}
                    {msg && (
                        <div
                            className={`mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${msg.type === "success"
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
                </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
                <p>
                    • Se o PHP estiver em outro domínio, use um proxy em <b>/api/php/admin</b> para evitar CORS.
                </p>
                <p>• Em produção, prefira HTTPS para todas as chamadas.</p>
            </div>
        </div>
    );
}
