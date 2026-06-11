"use client";

import React, { useMemo, useState } from "react";

import Modal from "./Modal";
import type { Registro } from "./types";

import EnviarObituario from "./EnviarObituario";

type Msg = {
    type: "success" | "error";
    text: string;
};

const PORTAL_FAMILIA_URL = "https://planoassistencialintegrado.com.br/portal-da-familia/";
const LEGADO_LUZ_URL = "https://planoassistencialintegrado.com.br/legado-de-luz/";

const btnPrimary =
    "w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 " +
    "disabled:opacity-60 disabled:pointer-events-none";

const btnSecondary =
    "w-full rounded-md border border-blue-700 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 " +
    "disabled:opacity-60 disabled:pointer-events-none";

const alertBase = "rounded-md border px-3 py-2 text-xs";

function removerAcentos(texto: string) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizarTexto(texto: string) {
    return removerAcentos(String(texto || ""))
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, " ");
}

function onlyDigits(v?: string | number | null) {
    return String(v ?? "").replace(/\D+/g, "");
}

function getNomeFalecido(registro?: Registro | null) {
    return String(
        (registro as any)?.falecido ||
        (registro as any)?.nome_completo ||
        (registro as any)?.nome_falecido ||
        ""
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

function getPrimeiroNomeSenha(registro?: Registro | null) {
    const nome = normalizarTexto(getNomeFalecido(registro));
    if (!nome) return "";

    return nome.split(/\s+/)[0] || "";
}

function getSalaVelorio(registro?: Registro | null) {
    return String((registro as any)?.sala_velorio || "").trim();
}

function getVelorioOnlineUrl(registro?: Registro | null) {
    const sala = normalizarTexto(getSalaVelorio(registro));

    if (["sala 01", "sala 1", "01", "1"].includes(sala)) {
        return "https://planoassistencialintegrado.com.br/velorio-online-sala-01/";
    }

    if (["sala 02", "sala 2", "02", "2"].includes(sala)) {
        return "https://planoassistencialintegrado.com.br/velorio-online-sala-02/";
    }

    if (["sala 03", "sala 3", "03", "3"].includes(sala)) {
        return "https://planoassistencialintegrado.com.br/velorio-online-sala-03/";
    }

    return "";
}

function getPortalFamiliaUrl(registro?: Registro | null) {
    const id = String((registro as any)?.id ?? "").trim();

    if (!id) return "";

    return `${PORTAL_FAMILIA_URL}?id=${encodeURIComponent(id)}`;
}

function getCodigoHomenagem(registro?: Registro | null) {
    const r = registro as any;

    return String(
        r?.codigo_homenagem ||
        r?.homenagem_codigo ||
        r?.homenagem_slug ||
        r?.slug_homenagem ||
        r?.legado_luz_codigo ||
        r?.legado_luz_slug ||
        ""
    )
        .trim()
        .replace(/^\/+|\/+$/g, "");
}

function getLegadoLuzUrl(registro?: Registro | null) {
    const r = registro as any;

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

    const codigo = getCodigoHomenagem(registro);

    if (!codigo) return "";

    return `${LEGADO_LUZ_URL}?codigo=${encodeURIComponent(codigo)}`;
}

function abrirLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
}

function abrirWhatsapp(texto: string) {
    const wa = `https://api.whatsapp.com/send/?text=${encodeURIComponent(texto)}`;
    abrirLink(wa);
}

export default function CompartilharModal({
    open,
    onClose,
    registro,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
}) {
    const [msg, setMsg] = useState<Msg | null>(null);

    const nomeFalecido = useMemo(() => getNomeFalecido(registro), [registro]);

    const velorioOnlineUrl = useMemo(
        () => getVelorioOnlineUrl(registro),
        [registro]
    );

    const portalFamiliaUrl = useMemo(
        () => getPortalFamiliaUrl(registro),
        [registro]
    );

    const legadoLuzUrl = useMemo(
        () => getLegadoLuzUrl(registro),
        [registro]
    );

    const handleEnviarVelorioOnline = () => {
        try {
            setMsg(null);

            if (!registro) {
                throw new Error("Nenhum atendimento selecionado.");
            }

            if (!velorioOnlineUrl) {
                throw new Error("Este atendimento não possui sala de velório online válida.");
            }

            const senha = getPrimeiroNomeSenha(registro);

            if (!senha) {
                throw new Error("Não foi possível gerar a senha do velório online.");
            }

            const texto =
                `Acesso ao Velório Online - Plano PAI\n\n` +
                `Falecido(a): ${nomeFalecido || "-"}\n\n` +
                `Link de acesso:\n${velorioOnlineUrl}\n\n` +
                `Senha: ${senha}`;

            abrirWhatsapp(texto);

            setMsg({
                type: "success",
                text: "Link do Velório Online preparado no WhatsApp.",
            });
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível enviar o Velório Online.",
            });
        }
    };

    const handleAcessarVelorioOnline = () => {
        try {
            setMsg(null);

            if (!velorioOnlineUrl) {
                throw new Error("Este atendimento não possui sala de velório online válida.");
            }

            abrirLink(velorioOnlineUrl);
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível acessar o Velório Online.",
            });
        }
    };

    const handleEnviarPortalFamilia = () => {
        try {
            setMsg(null);

            if (!registro) {
                throw new Error("Nenhum atendimento selecionado.");
            }

            if (!portalFamiliaUrl) {
                throw new Error("Este atendimento não possui ID válido para o Portal da Família.");
            }

            const responsavel = getResponsavel(registro);
            const cpf = getCpfResponsavel(registro);
            const senha = cpf.length >= 6 ? cpf.slice(0, 6) : "";

            if (!senha) {
                throw new Error("Este atendimento não possui CPF do responsável para gerar a senha.");
            }

            const texto =
                `Portal da Família PAI\n\n` +
                `Olá${responsavel ? `, ${responsavel}` : ""}.\n\n` +
                `Segue o acesso ao Portal da Família referente ao atendimento de ${nomeFalecido || "-"}.\n\n` +
                `Link de acesso:\n${portalFamiliaUrl}\n\n` +
                `Senha: ${senha}\n\n` +
                `A senha corresponde aos 6 primeiros números do CPF do responsável familiar.`;

            abrirWhatsapp(texto);

            setMsg({
                type: "success",
                text: "Link do Portal da Família preparado no WhatsApp.",
            });
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível enviar o Portal da Família.",
            });
        }
    };

    const handleAcessarPortalFamilia = () => {
        try {
            setMsg(null);

            if (!portalFamiliaUrl) {
                throw new Error("Este atendimento não possui ID válido para o Portal da Família.");
            }

            abrirLink(portalFamiliaUrl);
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível acessar o Portal da Família.",
            });
        }
    };

    const handleEnviarLegadoLuz = () => {
        try {
            setMsg(null);

            if (!registro) {
                throw new Error("Nenhum atendimento selecionado.");
            }

            if (!legadoLuzUrl) {
                throw new Error("Este atendimento ainda não possui link/slug do Legado de Luz.");
            }

            const responsavel = getResponsavel(registro);

            const texto =
                `Legado de Luz - Plano PAI\n\n` +
                `Olá${responsavel ? `, ${responsavel}` : ""}.\n\n` +
                `Segue o link da página de homenagens de ${nomeFalecido || "-"}.\n\n` +
                `Acesse e compartilhe suas memórias, mensagens, fotos, áudios e vídeos:\n${legadoLuzUrl}`;

            abrirWhatsapp(texto);

            setMsg({
                type: "success",
                text: "Link do Legado de Luz preparado no WhatsApp.",
            });
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível enviar o Legado de Luz.",
            });
        }
    };

    const handleAcessarLegadoLuz = () => {
        try {
            setMsg(null);

            if (!legadoLuzUrl) {
                throw new Error("Este atendimento ainda não possui link/slug do Legado de Luz.");
            }

            abrirLink(legadoLuzUrl);
        } catch (e: any) {
            setMsg({
                type: "error",
                text: e?.message || "Não foi possível acessar o Legado de Luz.",
            });
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            ariaLabel="Compartilhar Atendimento"
            maxWidth={620}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-center">
                    <h2 className="text-xl font-semibold leading-tight">
                        Compartilhar
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Escolha uma opção de envio ou acesso
                    </p>
                </div>

                <button
                    type="button"
                    className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    onClick={onClose}
                    title="Fechar"
                    aria-label="Fechar"
                >
                    Fechar
                </button>
            </div>

            <div className="mt-5 rounded-lg border bg-card/60 px-3 py-3 text-center">
                <div className="break-words text-sm font-bold uppercase tracking-wide">
                    {nomeFalecido || "Nenhum atendimento selecionado"}
                </div>
            </div>

            <div className="mt-5 grid gap-3">
                <EnviarObituario registro={registro} />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        className={btnPrimary}
                        onClick={handleEnviarVelorioOnline}
                        disabled={!registro}
                    >
                        Enviar Velório Online
                    </button>

                    <button
                        type="button"
                        className={btnSecondary}
                        onClick={handleAcessarVelorioOnline}
                        disabled={!registro || !velorioOnlineUrl}
                    >
                        Acessar Velório Online
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        className={btnPrimary}
                        onClick={handleEnviarPortalFamilia}
                        disabled={!registro}
                    >
                        Enviar Portal da Família
                    </button>

                    <button
                        type="button"
                        className={btnSecondary}
                        onClick={handleAcessarPortalFamilia}
                        disabled={!registro || !portalFamiliaUrl}
                    >
                        Acessar Portal
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        className={btnPrimary}
                        onClick={handleEnviarLegadoLuz}
                        disabled={!registro}
                    >
                        Enviar Legado de Luz
                    </button>

                    <button
                        type="button"
                        className={btnSecondary}
                        onClick={handleAcessarLegadoLuz}
                        disabled={!registro || !legadoLuzUrl}
                    >
                        Acessar Legado de Luz
                    </button>
                </div>

                {msg && (
                    <div
                        className={`${alertBase} ${msg.type === "success"
                                ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                                : "border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                            }`}
                        role="status"
                    >
                        {msg.text}
                    </div>
                )}
            </div>
        </Modal>
    );
}